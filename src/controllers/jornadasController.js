const { pool } = require('../config/db')
const { responderDatosInvalidos } = require('../helpers/erroresBD')
const { registrarAuditoria } = require('../helpers/auditoria')

// ─── OBTENER JORNADAS ─────────────────────────────────────────────────────────
const obtenerJornadas = async (_req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT j.jornad_id,
              j.sector_id,
              s.sector_no,
              j.jornad_no,
              j.jornad_fe,
              j.jornad_lu,
              j.jornad_de,
              j.jornad_es,
              j.jornad_vw,
              j.jornad_fre,
              j.jornad_ca,
              j.jornad_ob,
              (SELECT COUNT(*)::int FROM TT_CONSU c WHERE c.jornad_id = j.jornad_id) AS consultas
       FROM   TT_JORNAD j
       LEFT JOIN TM_SECTOR s ON s.sector_id = j.sector_id
       ORDER  BY j.jornad_fe DESC`
    )
    res.json({
      total: resultado.rows.length,
      registros: resultado.rows,
    })
  } catch (error) {
    console.error('Error en obtenerJornadas:', error.message)
    if (responderDatosInvalidos(res, error)) return
    res.status(500).json({ mensaje: 'Error al obtener los registros de jornadas' })
  }
}

// ─── JORNADAS PÚBLICAS (web) — GET /api/jornadas?visibles=1 ──────────────────
// Solo las próximas (PROGRAMADA / EN_CURSO) marcadas como visibles (JORNAD_VW);
// claves en mayúscula (JORNAD_NO, SECTOR_NO…), que es lo que lee la web pública.
const obtenerJornadasPublicas = async (_req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT j.jornad_id AS "JORNAD_ID",
              j.jornad_no AS "JORNAD_NO",
              TO_CHAR(j.jornad_fe, 'YYYY-MM-DD') AS "JORNAD_FE",
              j.jornad_lu AS "JORNAD_LU",
              j.jornad_de AS "JORNAD_DE",
              j.jornad_es AS "JORNAD_ES",
              COALESCE(j.jornad_lu, s.sector_no) AS "SECTOR_NO"
       FROM   TT_JORNAD j
       LEFT JOIN TM_SECTOR s ON s.sector_id = j.sector_id
       WHERE  j.jornad_vw = true AND j.jornad_es IN ('PROGRAMADA', 'EN_CURSO')
       ORDER  BY j.jornad_fe ASC`
    )
    res.json({ total: resultado.rows.length, jornadas: resultado.rows })
  } catch (error) {
    console.error('Error en obtenerJornadasPublicas:', error.message)
    if (responderDatosInvalidos(res, error)) return
    res.status(500).json({ mensaje: 'Error al obtener las jornadas' })
  }
}

// ─── CREAR JORNADA ────────────────────────────────────────────────────────────
const crearJornada = async (req, res) => {
  const { SECTOR_ID, JORNAD_NO, JORNAD_FE, JORNAD_LU, JORNAD_DE } = req.body
  const { USUARI_ID, ROLREG_ID } = req.usuario

  if (!SECTOR_ID || !JORNAD_NO || !JORNAD_FE) {
    return res.status(400).json({ mensaje: 'Sector, nombre y fecha son obligatorios' })
  }

  try {
    const resultado = await pool.query(
      `INSERT INTO TT_JORNAD
         (SECTOR_ID, JORNAD_NO, JORNAD_FE, JORNAD_LU, JORNAD_DE, JORNAD_ES, JORNAD_VW, USUARI_ID, JORNAD_FRE)
       VALUES ($1, $2, $3, $4, $5, 'PROGRAMADA', true, $6, CURRENT_TIMESTAMP)
       RETURNING *`,
      [SECTOR_ID, JORNAD_NO, JORNAD_FE, JORNAD_LU || null, JORNAD_DE || null, USUARI_ID]
    )

    await registrarAuditoria(pool, {
      usuari_id: USUARI_ID,
      rol: ROLREG_ID,
      modulo: 'JORNADAS',
      accion: `Jornada planificada: ${JORNAD_NO} — Sector ID ${SECTOR_ID} — Fecha: ${JORNAD_FE}`,
      tipo: 'INFO',
      ip: req.ip,
    })

    res.status(201).json({
      mensaje: 'Jornada planificada exitosamente',
      registro: resultado.rows[0],
    })
  } catch (error) {
    console.error('Error en crearJornada:', error.message)
    if (responderDatosInvalidos(res, error)) return
    res.status(500).json({ mensaje: 'Error al registrar la jornada' })
  }
}

// ─── ELIMINAR JORNADA ─────────────────────────────────────────────────────────
const eliminarJornada = async (req, res) => {
  const { id } = req.params
  const { USUARI_ID, ROLREG_ID } = req.usuario

  try {
    const resultado = await pool.query(
      `DELETE FROM TT_JORNAD WHERE JORNAD_ID = $1 RETURNING jornad_no`,
      [id]
    )

    if (resultado.rows.length === 0) {
      return res.status(404).json({ mensaje: 'Jornada no encontrada' })
    }

    await registrarAuditoria(pool, {
      usuari_id: USUARI_ID,
      rol: ROLREG_ID,
      modulo: 'JORNADAS',
      accion: `Jornada eliminada: ${resultado.rows[0].jornad_no} (ID: ${id})`,
      tipo: 'ALERTA',
      ip: req.ip,
    })

    res.json({ mensaje: 'Jornada eliminada correctamente' })
  } catch (error) {
    if (error.code === '23503') {
      return res.status(409).json({ mensaje: 'No se puede eliminar: la jornada tiene consultas o personal registrados. Puede modificarla en su lugar.' })
    }
    console.error('Error en eliminarJornada:', error.message)
    if (responderDatosInvalidos(res, error)) return
    res.status(500).json({ mensaje: 'Error al eliminar la jornada' })
  }
}

// ─── REGISTRAR OPERACIÓN DE JORNADA (cierre) ──────────────────────────────────
// Guarda la cantidad de animales atendidos y las observaciones en TT_JORNAD
// (JORNAD_CA / JORNAD_OB, migración 001) y marca la jornada como FINALIZADA.
// El personal participante se registra automáticamente en TT_JOPER al guardar
// cada consulta médica vinculada a la jornada (ver veterinariaController).
const registrarOperacion = async (req, res) => {
  const { JORNAD_ID, CANT_ATEND, OBS_JOPER } = req.body
  const { USUARI_ID, ROLREG_ID } = req.usuario
  const cantidad = Number(CANT_ATEND)

  if (!JORNAD_ID || CANT_ATEND === undefined || !Number.isInteger(cantidad) || cantidad < 0) {
    return res.status(400).json({ mensaje: 'Faltan datos obligatorios para el registro operativo' })
  }

  const cliente = await pool.connect()

  try {
    await cliente.query('BEGIN')

    const jornadaCerrada = await cliente.query(
      `UPDATE TT_JORNAD
       SET    JORNAD_CA = $2, JORNAD_OB = $3, JORNAD_ES = 'FINALIZADA'
       WHERE  JORNAD_ID = $1
       RETURNING *`,
      [JORNAD_ID, cantidad, OBS_JOPER || null]
    )

    if (jornadaCerrada.rows.length === 0) {
      await cliente.query('ROLLBACK')
      return res.status(404).json({ mensaje: 'Jornada no encontrada' })
    }

    await registrarAuditoria(cliente, {
      usuari_id: USUARI_ID,
      rol: ROLREG_ID,
      modulo: 'JORNADAS_OPERATIVA',
      accion: `Registro operativo en jornada ${JORNAD_ID}. Atendidos: ${CANT_ATEND}`,
      tipo: 'INFO',
      ip: req.ip,
    })

    await cliente.query('COMMIT')

    res.status(201).json({
      mensaje: 'Registro operativo guardado exitosamente',
      registro: jornadaCerrada.rows[0],
    })
  } catch (error) {
    await cliente.query('ROLLBACK')
    console.error('Error en registrarOperacion:', error.message)
    if (responderDatosInvalidos(res, error)) return
    res.status(500).json({ mensaje: 'Error al guardar los datos operativos de la jornada' })
  } finally {
    cliente.release()
  }
}

// ─── MODIFICAR JORNADA — PUT /api/jornadas/:id ───────────────────────────────
const actualizarJornada = async (req, res) => {
  const { id } = req.params
  const { SECTOR_ID, JORNAD_NO, JORNAD_FE, JORNAD_LU, JORNAD_DE } = req.body
  const { USUARI_ID, ROLREG_ID } = req.usuario

  if (!SECTOR_ID || !JORNAD_NO || !JORNAD_FE) {
    return res.status(400).json({ mensaje: 'Sector, nombre y fecha son obligatorios' })
  }

  try {
    const resultado = await pool.query(
      `UPDATE TT_JORNAD
       SET    SECTOR_ID = $1, JORNAD_NO = $2, JORNAD_FE = $3, JORNAD_LU = $4, JORNAD_DE = $5
       WHERE  JORNAD_ID = $6
       RETURNING *`,
      [SECTOR_ID, JORNAD_NO, JORNAD_FE, JORNAD_LU || null, JORNAD_DE || null, id]
    )
    if (resultado.rows.length === 0) {
      return res.status(404).json({ mensaje: 'Jornada no encontrada' })
    }

    await registrarAuditoria(pool, {
      usuari_id: USUARI_ID,
      rol: ROLREG_ID,
      modulo: 'JORNADAS',
      accion: `Jornada modificada: ${JORNAD_NO} (ID: ${id}) — Fecha: ${JORNAD_FE}`,
      tipo: 'INFO',
      ip: req.ip,
    })

    res.json({ mensaje: 'Jornada actualizada', registro: resultado.rows[0] })
  } catch (error) {
    if (error.code === '23503') return res.status(400).json({ mensaje: 'El sector seleccionado no es válido' })
    console.error('Error en actualizarJornada:', error.message)
    if (responderDatosInvalidos(res, error)) return
    res.status(500).json({ mensaje: 'Error al modificar la jornada' })
  }
}

module.exports = { obtenerJornadas, obtenerJornadasPublicas, crearJornada, actualizarJornada, eliminarJornada, registrarOperacion }
