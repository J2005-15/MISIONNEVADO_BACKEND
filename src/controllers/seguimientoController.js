const { pool } = require('../config/db')
const { responderDatosInvalidos } = require('../helpers/erroresBD')

// Etiquetas que muestra la web (sus colores ya existen en el diseño:
// Aprobado, Completado, En espera, Pendiente; el resto sale en gris).
const ESTADO_ADOPCION = { PENDIENTE: 'Pendiente', APROBADA: 'Aprobado', RECHAZADA: 'Rechazado' }
const ESTADO_DENUNCIA = { ABIERTA: 'Pendiente', EN_PROCESO: 'En espera', CERRADA: 'Completado', DESESTIMADA: 'Desestimada' }
const ESTADO_REGISTRO = { Inactivo: 'En espera', Activo: 'Aprobado' }

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const formatearFecha = (fecha) => {
  if (!fecha) return ''
  const d = new Date(fecha)
  return `${d.getDate()} de ${MESES[d.getMonth()]}, ${d.getFullYear()}`
}

// ─── GET /api/seguimiento?email=<correo o cédula> (público) ───────────────────
// Busca todos los trámites de una persona. Con '@' se busca por correo; si no,
// por cédula comparando solo los dígitos (V-12.345.678 = 12345678).
const consultarSeguimiento = async (req, res) => {
  const dato = String(req.query.email ?? req.query.dato ?? '').trim()
  if (!dato) {
    return res.status(400).json({ mensaje: 'Debe indicar su cédula o correo electrónico' })
  }

  const esCorreo = dato.includes('@')
  const digitos  = dato.replace(/\D/g, '')
  if (!esCorreo && digitos.length < 5) {
    return res.status(400).json({ mensaje: 'La cédula no es válida' })
  }

  // Condición sobre TM_PERSON (alias p) según el tipo de dato
  const porPersona = esCorreo
    ? `LOWER(p.person_em) = LOWER($1)`
    : `regexp_replace(p.person_ce, '\\D', '', 'g') = $1`
  const valor = esCorreo ? dato : digitos

  try {
    const [adopciones, denuncias, voluntarios, proteccionistas] = await Promise.all([
      pool.query(
        `SELECT s.sol_fe AS fecha, s.sol_es AS estado, a.adopci_no AS mascota
         FROM   TT_SOLIC s
         LEFT JOIN TM_ADOPCI a ON a.adopci_id = s.adopci_id
         WHERE  ${esCorreo ? `LOWER(s.sol_em) = LOWER($1)` : `regexp_replace(s.sol_ce, '\\D', '', 'g') = $1`}`,
        [valor]
      ),
      pool.query(
        `SELECT d.denunc_fe AS fecha, d.denunc_es AS estado, s.sector_no AS sector
         FROM   TT_DENUNC d
         LEFT JOIN TM_PERSON p ON p.person_id = d.person_id
         LEFT JOIN TM_SECTOR s ON s.sector_id = d.sector_id
         WHERE  ${porPersona}${esCorreo ? ' OR LOWER(d.denunc_em) = LOWER($1)' : ''}`,
        [valor]
      ),
      pool.query(
        `SELECT v.volun_fe AS fecha, v.volun_st AS estado
         FROM   TM_VOLUNT v
         JOIN   TM_PERSON p ON p.person_id = v.person_id
         WHERE  ${porPersona}`,
        [valor]
      ),
      pool.query(
        `SELECT x.prtec_fe AS fecha, x.prtec_st AS estado
         FROM   TM_PROTEC x
         JOIN   TM_PERSON p ON p.person_id = x.person_id
         WHERE  ${porPersona}`,
        [valor]
      ),
    ])

    const tramites = [
      ...adopciones.rows.map((r) => ({
        tipo: `Solicitud de adopción${r.mascota ? ` — ${r.mascota}` : ''}`,
        _fe:  r.fecha, estado: ESTADO_ADOPCION[r.estado] ?? r.estado,
      })),
      ...denuncias.rows.map((r) => ({
        tipo: `Denuncia${r.sector ? ` — ${r.sector}` : ''}`,
        _fe:  r.fecha, estado: ESTADO_DENUNCIA[r.estado] ?? r.estado,
      })),
      ...voluntarios.rows.map((r) => ({
        tipo: 'Registro de voluntariado',
        _fe:  r.fecha, estado: ESTADO_REGISTRO[r.estado] ?? r.estado,
      })),
      ...proteccionistas.rows.map((r) => ({
        tipo: 'Registro de proteccionista',
        _fe:  r.fecha, estado: ESTADO_REGISTRO[r.estado] ?? r.estado,
      })),
    ]
      .sort((a, b) => new Date(b._fe) - new Date(a._fe))
      .map(({ _fe, ...t }) => ({ ...t, fecha: formatearFecha(_fe) }))

    if (tramites.length === 0) {
      return res.status(404).json({ mensaje: 'No se encontraron trámites', tramites: [], tramite: null })
    }

    // `tramite` (el más reciente) se mantiene por compatibilidad; `tramites` trae todos
    res.json({ total: tramites.length, tramite: tramites[0], tramites })
  } catch (error) {
    console.error('Error en consultarSeguimiento:', error.message)
    if (responderDatosInvalidos(res, error)) return
    res.status(500).json({ mensaje: 'Error al consultar el seguimiento' })
  }
}

module.exports = { consultarSeguimiento }
