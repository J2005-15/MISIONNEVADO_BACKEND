const { pool } = require('../config/db')
const { responderDatosInvalidos } = require('../helpers/erroresBD')
const { registrarAuditoria } = require('../helpers/auditoria')
const { obtenerConfigSistema } = require('../helpers/configSistema')

// ─── REPORTE GENERAL DEL SISTEMA ─────────────────────────────────────────────
// GET /api/reportes/sistema?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
// Resumen de todos los módulos + movimientos del censo y del inventario +
// eventos importantes de la bitácora en el periodo. El panel lo convierte en
// un documento imprimible / PDF.
const FECHA = /^\d{4}-\d{2}-\d{2}$/
const hoy = () => new Date().toLocaleDateString('en-CA')   // YYYY-MM-DD local
const inicioDeMes = () => `${hoy().slice(0, 8)}01`

const reporteSistema = async (req, res) => {
  const desde = String(req.query.desde || inicioDeMes())
  const hasta = String(req.query.hasta || hoy())
  if (!FECHA.test(desde) || !FECHA.test(hasta) || Number.isNaN(Date.parse(desde)) || Number.isNaN(Date.parse(hasta))) {
    return res.status(400).json({ mensaje: 'Las fechas del periodo no son válidas' })
  }
  if (desde > hasta) {
    return res.status(400).json({ mensaje: 'La fecha "desde" no puede ser posterior a la fecha "hasta"' })
  }

  // Filtros de periodo: fechas (DATE) y marcas de tiempo (TIMESTAMP, hasta el final del día)
  const enFecha  = (col) => `${col} BETWEEN $1::date AND $2::date`
  const enMarca  = (col) => `${col} >= $1::date AND ${col} < ($2::date + 1)`
  const p = [desde, hasta]
  const q = async (sql, valores = []) => (await pool.query(sql, valores)).rows
  const uno = async (sql, valores = []) => (await q(sql, valores))[0]

  try {
    const [
      censoTot, censoEspecie, censoSector, censoPeriodo, movCenso,
      adopEstados, solicitudes,
      vet, jornadas,
      denunEstados, denunPeriodo,
      volunt, protec,
      colab, colabTipo,
      stock, movStock,
      usuarios, bitacoraTipos, bitacoraImportantes,
      quien, config,
    ] = await Promise.all([
      uno(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE ${enFecha('fec_censo')})::int AS periodo FROM tt_censoa`, p),
      q(`SELECT COALESCE(e.especi_no, 'Sin especie') AS nombre, COUNT(*)::int AS total
         FROM tt_censoa c LEFT JOIN tm_especi e ON e.especi_id = c.especi_id GROUP BY 1 ORDER BY 2 DESC`),
      q(`SELECT COALESCE(s.sector_no, 'Sin sector') AS nombre, COUNT(*)::int AS total
         FROM tt_censoa c LEFT JOIN tm_sector s ON s.sector_id = c.sector_id GROUP BY 1 ORDER BY 2 DESC`),
      q(`SELECT c.fec_censo AS fecha, c.nom_anima AS animal, e.especi_no AS especie, s.sector_no AS sector,
                TRIM(CONCAT(pe.person_no, ' ', pe.person_ap)) AS dueno, pe.person_ce AS cedula
         FROM tt_censoa c
         LEFT JOIN tm_especi e  ON e.especi_id  = c.especi_id
         LEFT JOIN tm_sector s  ON s.sector_id  = c.sector_id
         LEFT JOIN tm_person pe ON pe.person_id = c.person_id
         WHERE ${enFecha('c.fec_censo')} ORDER BY c.fec_censo DESC, c.censoa_id DESC LIMIT 500`, p),
      q(`SELECT a.audit_fe AS fecha, COALESCE(a.audit_em, u.usuari_em, u.usuari_no, 'Visitante web') AS usuario, a.audit_ac AS accion
         FROM th_audit a LEFT JOIN tm_usuario u ON u.usuari_id = a.usuari_id
         WHERE a.audit_mo IN ('CENSO_ANIMAL', 'Censo') AND ${enMarca('a.audit_fe')}
         ORDER BY a.audit_fe DESC LIMIT 500`, p),

      q(`SELECT adopci_st AS estado, COUNT(*)::int AS total FROM tm_adopci GROUP BY 1`),
      uno(`SELECT COUNT(*) FILTER (WHERE sol_es = 'PENDIENTE')::int AS pendientes,
                  COUNT(*) FILTER (WHERE sol_es = 'APROBADA')::int  AS aprobadas,
                  COUNT(*) FILTER (WHERE sol_es = 'RECHAZADA')::int AS rechazadas,
                  COUNT(*) FILTER (WHERE ${enMarca('sol_fe')})::int   AS periodo
           FROM tt_solic`, p),

      uno(`SELECT COUNT(*) FILTER (WHERE ${enFecha('consul_fe')})::int AS consultas,
                  COUNT(DISTINCT censoa_id) FILTER (WHERE ${enFecha('consul_fe')})::int AS pacientes
           FROM tt_consu`, p),
      uno(`SELECT COUNT(*) FILTER (WHERE ${enFecha('jornad_fe')})::int AS periodo,
                  COUNT(*) FILTER (WHERE ${enFecha('jornad_fe')} AND jornad_es = 'FINALIZADA')::int AS finalizadas,
                  COALESCE(SUM(jornad_ca) FILTER (WHERE ${enFecha('jornad_fe')}), 0)::int AS atendidos,
                  COUNT(*) FILTER (WHERE jornad_es IN ('PROGRAMADA', 'EN_CURSO') AND jornad_fe >= CURRENT_DATE)::int AS proximas
           FROM tt_jornad`, p),

      q(`SELECT denunc_es AS estado, COUNT(*)::int AS total FROM tt_denunc GROUP BY 1 ORDER BY 1`),
      uno(`SELECT COUNT(*)::int AS periodo FROM tt_denunc WHERE ${enFecha('denunc_fe')}`, p),

      uno(`SELECT COUNT(*) FILTER (WHERE volun_st = 'Activo')::int AS activos, COUNT(*) FILTER (WHERE volun_st <> 'Activo')::int AS espera FROM tm_volunt`),
      uno(`SELECT COUNT(*) FILTER (WHERE prtec_st = 'Activo')::int AS activos, COUNT(*) FILTER (WHERE prtec_st <> 'Activo')::int AS espera FROM tm_protec`),

      uno(`SELECT COUNT(*)::int AS periodo,
                  COALESCE(SUM((SELECT SUM(d.detco_ca * d.detco_va) FROM tt_detco d WHERE d.colab_id = c.colab_id)), 0)::numeric AS monto
           FROM tt_colab c WHERE ${enFecha('c.colab_fe')}`, p),
      q(`SELECT colab_ti AS tipo, COUNT(*)::int AS total FROM tt_colab WHERE ${enFecha('colab_fe')} GROUP BY 1 ORDER BY 2 DESC`, p),

      q(`SELECT i.insumo_no AS insumo, c.catego_no AS categoria, i.insumo_un AS unidad,
                i.insumo_ex::numeric AS existencia, i.insumo_sm::numeric AS minimo, i.insumo_fe AS vence
         FROM tm_insum i LEFT JOIN tm_catego c ON c.catego_id = i.catego_id ORDER BY i.insumo_no`),
      q(`SELECT m.movin_fe AS fecha, i.insumo_no AS insumo, i.insumo_un AS unidad, m.movin_ti AS tipo,
                m.movin_ca AS cantidad, m.movin_an AS anterior, m.movin_nu AS nueva, m.movin_mo AS motivo,
                COALESCE(u.usuari_em, u.usuari_no, 'Sistema') AS usuario
         FROM tt_movin m
         JOIN tm_insum i ON i.insum_id = m.insum_id
         LEFT JOIN tm_usuario u ON u.usuari_id = m.usuari_id
         WHERE ${enMarca('m.movin_fe')}
         ORDER BY m.movin_fe DESC, m.movin_id DESC LIMIT 500`, p),

      uno(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE usuari_es = 'ACTIVO')::int AS activos FROM tm_usuario`),
      q(`SELECT audit_ti AS tipo, COUNT(*)::int AS total FROM th_audit WHERE ${enMarca('audit_fe')} GROUP BY 1`, p),
      q(`SELECT a.audit_fe AS fecha, a.audit_ti AS tipo, a.audit_mo AS modulo,
                COALESCE(a.audit_em, u.usuari_em, u.usuari_no, 'Visitante web') AS usuario, a.audit_ac AS accion
         FROM th_audit a LEFT JOIN tm_usuario u ON u.usuari_id = a.usuari_id
         WHERE a.audit_ti IN ('ALERTA', 'CRITICO') AND ${enMarca('a.audit_fe')}
         ORDER BY a.audit_fe DESC LIMIT 200`, p),

      uno(`SELECT u.usuari_em, TRIM(CONCAT(pe.person_no, ' ', pe.person_ap)) AS nombre
           FROM tm_usuario u LEFT JOIN tm_person pe ON pe.person_id = u.person_id WHERE u.usuari_id = $1`, [req.usuario.USUARI_ID]),
      obtenerConfigSistema(),
    ])

    const porEstado = (filas) => Object.fromEntries(filas.map(f => [f.estado, f.total]))
    const adop = porEstado(adopEstados)
    const tipos = Object.fromEntries(bitacoraTipos.map(f => [f.tipo, f.total]))
    const stockConEstado = stock.map(s => ({
      ...s,
      existencia: Number(s.existencia),
      minimo:     Number(s.minimo),
      estado:     Number(s.existencia) <= 0 ? 'Agotado' : Number(s.existencia) < Number(s.minimo) ? 'Bajo mínimo' : 'Disponible',
    }))

    await registrarAuditoria(null, {
      usuari_id: req.usuario.USUARI_ID,
      modulo:    'Reportes',
      accion:    `Reporte general del sistema exportado (${desde} al ${hasta})`,
      tipo:      'INFO',
      ip:        req.ip,
    })

    res.json({
      periodo:     { desde, hasta },
      generado:    new Date().toISOString(),
      generadoPor: quien?.nombre || quien?.usuari_em || '—',
      institucion: config.institucion,
      resumen: {
        censo:          { total: censoTot.total, periodo: censoTot.periodo, porEspecie: censoEspecie, porSector: censoSector },
        adopciones:     { disponibles: adop.DISPONIBLE ?? 0, enProceso: adop['EN PROCESO'] ?? 0, adoptados: adop.ADOPTADO ?? 0, solicitudes },
        veterinaria:    { ...vet, jornadas },
        denuncias:      { porEstado: denunEstados, periodo: denunPeriodo.periodo },
        voluntarios:    volunt,
        proteccionistas: protec,
        colaboraciones: { periodo: colab.periodo, monto: Number(colab.monto), porTipo: colabTipo },
        inventario:     {
          insumos:    stockConEstado.length,
          bajoMinimo: stockConEstado.filter(s => s.estado === 'Bajo mínimo').length,
          agotados:   stockConEstado.filter(s => s.estado === 'Agotado').length,
        },
        usuarios,
        bitacora:       { info: tipos.INFO ?? 0, alertas: tipos.ALERTA ?? 0, criticos: tipos.CRITICO ?? 0 },
      },
      censoPeriodo,
      movimientosCenso: movCenso,
      stock:            stockConEstado,
      movimientosStock: movStock,
      eventosImportantes: bitacoraImportantes,
    })
  } catch (error) {
    console.error('Error en reporteSistema:', error.message)
    if (responderDatosInvalidos(res, error)) return
    res.status(500).json({ mensaje: 'No se pudo generar el reporte del sistema' })
  }
}

module.exports = { reporteSistema }
