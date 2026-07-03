const { pool } = require('../config/db')
const { registrarAuditoria } = require('../helpers/auditoria')
const cloudinary = require('../helpers/cloudinary')

const subirFoto = (buffer) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: 'sisvic/adopciones', resource_type: 'image' },
      (err, result) => (err ? reject(err) : resolve(result.secure_url))
    )
    stream.end(buffer)
  })

// ─── OBTENER CARTELERA DE ADOPCIONES ──────────────────────────────────────────
const obtenerCatalogo = async (_req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT * FROM TM_ADOPCI
       WHERE ADOPCI_ST IN ('DISPONIBLE', 'EN PROCESO')
       ORDER BY ADOPCI_ID ASC`
    )
    res.json({
      total:     resultado.rows.length,
      registros: resultado.rows,
    })
  } catch (error) {
    console.error('Error en obtenerCatalogo:', error.message)
    res.status(500).json({ mensaje: 'Error al obtener los datos de la cartelera' })
  }
}

// ─── LISTAR SOLICITUDES (ADMIN) ───────────────────────────────────────────────
const obtenerSolicitudes = async (_req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT s.solic_id,
              s.adopci_id,
              a.adopci_no AS mascota_no,
              s.solic_ce,
              s.solic_no,
              s.solic_em,
              s.solic_tl,
              s.solic_mo,
              s.solic_es,
              s.solic_fe
       FROM TT_SOLIC s
       LEFT JOIN TM_ADOPCI a ON a.adopci_id = s.adopci_id
       ORDER BY s.solic_id DESC`
    )
    res.json({ total: resultado.rows.length, registros: resultado.rows })
  } catch (error) {
    console.error('Error en obtenerSolicitudes:', error.message)
    res.status(500).json({ mensaje: 'Error al obtener las solicitudes de adopción' })
  }
}

// ─── RECIBIR SOLICITUD PÚBLICA ────────────────────────────────────────────────
const recibirSolicitud = async (req, res) => {
  const {
    ADOPCI_ID,   
    SOLIC_CE,
    SOLIC_NO,
    SOLIC_EM,
    SOLIC_TL,
    SOLIC_MO,
  } = req.body

  try {
    const solicitudInsert = await pool.query(
      `INSERT INTO TT_SOLIC
         (ADOPCI_ID, SOLIC_CE, SOLIC_NO, SOLIC_EM, SOLIC_TL, SOLIC_MO, SOLIC_ES)
       VALUES ($1, $2, $3, $4, $5, $6, 'Pendiente')
       RETURNING *`,
      [ADOPCI_ID, SOLIC_CE, SOLIC_NO, SOLIC_EM, SOLIC_TL, SOLIC_MO]
    )

    await registrarAuditoria(pool, {
      modulo: 'ADOPCIONES_PUBLICO',
      accion: `Nueva solicitud de adopción recibida (ADOPCI_ID: ${ADOPCI_ID}) por el solicitante: ${SOLIC_EM}`,
      tipo: 'INFO',
      ip: req.ip
    })

    res.status(201).json({
      mensaje:  'Solicitud enviada correctamente',
      registro: solicitudInsert.rows[0],
    })
  } catch (error) {
    console.error('Error en recibirSolicitud:', error.message)
    res.status(500).json({ mensaje: 'Error al guardar los datos de la solicitud' })
  }
}

// ─── GESTIONAR SOLICITUD ADMINISTRATIVA ───────────────────────────────────────
const gestionarSolicitud = async (req, res) => {
  const { id } = req.params
  const { SOLIC_ES } = req.body // ej: 'APROBADA', 'RECHAZADA'
  const { USUARI_ID, ROLREG_ID } = req.usuario

  try {
    const solicitudUpdate = await pool.query(
      `UPDATE TT_SOLIC
       SET SOLIC_ES = $1
       WHERE SOLIC_ID = $2
       RETURNING *`,
      [SOLIC_ES, id]
    )

    if (solicitudUpdate.rows.length === 0) {
      return res.status(404).json({ mensaje: 'Registro no encontrado' })
    }

    await registrarAuditoria(pool, {
      usuari_id: USUARI_ID,
      rol: ROLREG_ID,
      modulo: 'ADOPCIONES_ADMIN',
      accion: `Solicitud ${id} actualizada a estado: ${SOLIC_ES}`,
      tipo: 'INFO',
      ip: req.ip
    })

    res.json({
      mensaje:  `Solicitud marcada como ${SOLIC_ES}`,
      registro: solicitudUpdate.rows[0],
    })
  } catch (error) {
    console.error('Error en gestionarSolicitud:', error.message)
    res.status(500).json({ mensaje: 'Error al modificar los detalles de la solicitud' })
  }
}

// ─── REGISTRAR NUEVO ANIMAL EN CARTELERA (ADMIN) ─────────────────────────────
const registrarPaciente = async (req, res) => {
  const {
    nombre, especie, sexo, raza,
    color, fecha_nacimiento, peso, descripcion,
  } = req.body

  if (!nombre || !sexo) {
    return res.status(400).json({ mensaje: 'Nombre y sexo son obligatorios' })
  }

  let fotoUrl = null
  if (req.file) {
    try {
      fotoUrl = await subirFoto(req.file.buffer)
    } catch (uploadError) {
      console.error('Error subiendo foto a Cloudinary:', uploadError.message)
    }
  }

  // Resolver IDs de catálogo de forma independiente (si fallan no bloquean el INSERT)
  let especiId = null
  if (especie) {
    try {
      const r = await pool.query(
        `SELECT especi_id FROM TM_ESPECI WHERE LOWER(especi_no) = LOWER($1) LIMIT 1`,
        [especie]
      )
      if (r.rows.length > 0) especiId = r.rows[0].especi_id
    } catch { /* catálogo no disponible */ }
  }

  let razaId = null
  if (raza && especiId) {
    try {
      const r = await pool.query(
        `SELECT razare_id FROM TM_RAZARE WHERE LOWER(razare_no) = LOWER($1) AND especi_id = $2 LIMIT 1`,
        [raza, especiId]
      )
      if (r.rows.length > 0) razaId = r.rows[0].razare_id
    } catch { /* catálogo no disponible */ }
  }

  try {

    const resultado = await pool.query(
      `INSERT INTO TM_ADOPCI
         (ADOPCI_NO, ADOPCI_SE, ADOPCI_CO, ADOPCI_FN, ADOPCI_PE, ADOPCI_DE, ADOPCI_FT, ADOPCI_ST, ADOPCI_VW, ESPECI_ID, RAZARE_ID)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'DISPONIBLE', false, $8, $9)
       RETURNING *`,
      [
        nombre,
        sexo,
        color    || null,
        fecha_nacimiento || null,
        peso     || null,
        descripcion || null,
        fotoUrl,
        especiId,
        razaId,
      ]
    )

    await registrarAuditoria(pool, {
      modulo: 'ADOPCIONES_ADMIN',
      accion: `Nuevo paciente registrado en cartelera: ${nombre}${especie ? ` (${especie})` : ''}`,
      tipo: 'INFO',
      ip: req.ip,
    })

    res.status(201).json({
      mensaje:  'Paciente registrado en la cartelera de adopción',
      paciente: resultado.rows[0],
    })
  } catch (error) {
    console.error('Error en registrarPaciente:', error.message)
    res.status(500).json({ mensaje: 'Error al registrar el paciente en la cartelera' })
  }
}

module.exports = { obtenerCatalogo, obtenerSolicitudes, recibirSolicitud, gestionarSolicitud, registrarPaciente }
