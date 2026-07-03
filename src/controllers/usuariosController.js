const bcrypt = require('bcrypt')
const { pool } = require('../config/db')
const { registrarAuditoria } = require('../helpers/auditoria')

// ── GET /api/usuarios ──────────────────────────────────────────────────────────
const obtenerUsuarios = async (_req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT u.USUARI_ID, u.USUARI_NO, u.USUARI_EM, u.USUARI_ES, u.USUARI_FE,
              r.ROLREG_ID, r.ROLREG_NO,
              p.PERSON_CE, p.PERSON_NO, p.PERSON_AP, p.PERSON_TL
       FROM   TM_USUARIO u
       JOIN   TM_ROLREG  r ON r.ROLREG_ID = u.ROLREG_ID
       LEFT JOIN TM_PERSON p ON p.PERSON_ID = u.PERSON_ID
       ORDER  BY u.USUARI_FE DESC`
    )
    res.json({
      total:     resultado.rows.length,
      registros: resultado.rows,
    })
  } catch (error) {
    console.error('Error en obtenerUsuarios:', error.message)
    res.status(500).json({ mensaje: 'Error al obtener los usuarios del sistema' })
  }
}

// ── POST /api/usuarios ─────────────────────────────────────────────────────────
// Body esperado: { PERSON_ID (cédula), ROLESG_ID, USUARI_NO, USUARI_CL, USUARI_ES?, USUARI_EM? }
const crearUsuario = async (req, res) => {
  const {
    PERSON_ID: PERSON_CE,
    ROLESG_ID,
    USUARI_NO,
    USUARI_CL,
    USUARI_ES = 'ACTIVO',
    USUARI_EM,
  } = req.body
  const { USUARI_ID: adminId } = req.usuario

  if (!USUARI_NO || !USUARI_CL || !ROLESG_ID) {
    return res.status(400).json({ mensaje: 'USUARI_NO, USUARI_CL y ROLESG_ID son obligatorios' })
  }

  const cliente = await pool.connect()
  try {
    await cliente.query('BEGIN')

    // Buscar persona por cédula si se proporcionó
    let person_id = null
    if (PERSON_CE && String(PERSON_CE).trim()) {
      const personRes = await cliente.query(
        `SELECT PERSON_ID FROM TM_PERSON WHERE PERSON_CE = $1`,
        [String(PERSON_CE).trim()]
      )
      if (personRes.rows.length > 0) {
        person_id = personRes.rows[0].person_id
      }
    }

    const hash = await bcrypt.hash(USUARI_CL, 12)

    const resultado = await cliente.query(
      `INSERT INTO TM_USUARIO (PERSON_ID, ROLREG_ID, USUARI_NO, USUARI_EM, USUARI_CL, USUARI_ES)
       VALUES ($1, $2, $3, $4, $5, $6::estado_usuario)
       RETURNING USUARI_ID, USUARI_NO, USUARI_EM, USUARI_ES, ROLREG_ID`,
      [person_id, ROLESG_ID, USUARI_NO.trim(), USUARI_EM?.trim() ?? null, hash, USUARI_ES]
    )

    await cliente.query('COMMIT')

    await registrarAuditoria(null, {
      usuari_id: adminId,
      modulo:    'Usuarios',
      accion:    `Nuevo usuario creado — ${USUARI_NO}`,
      tipo:      'INFO',
    })

    res.status(201).json({
      mensaje:  'Usuario creado exitosamente',
      registro: resultado.rows[0],
    })
  } catch (error) {
    await cliente.query('ROLLBACK')
    if (error.code === '23505') {
      return res.status(409).json({ mensaje: 'El nombre de usuario o correo ya está registrado' })
    }
    console.error('Error en crearUsuario:', error.message)
    res.status(500).json({ mensaje: 'Error al crear el usuario' })
  } finally {
    cliente.release()
  }
}

// ── PATCH /api/usuarios/:id/estado ────────────────────────────────────────────
const actualizarEstado = async (req, res) => {
  const { id } = req.params
  const { USUARI_ES } = req.body
  const { USUARI_ID: adminId } = req.usuario

  const estadosValidos = ['ACTIVO', 'INACTIVO', 'SUSPENDIDO']
  if (!USUARI_ES || !estadosValidos.includes(USUARI_ES)) {
    return res.status(400).json({
      mensaje: `USUARI_ES debe ser uno de: ${estadosValidos.join(', ')}`,
    })
  }

  try {
    const resultado = await pool.query(
      `UPDATE TM_USUARIO
       SET    USUARI_ES = $1::estado_usuario
       WHERE  USUARI_ID = $2
       RETURNING USUARI_ID, USUARI_NO, USUARI_ES`,
      [USUARI_ES, id]
    )

    if (resultado.rows.length === 0) {
      return res.status(404).json({ mensaje: 'Usuario no encontrado' })
    }

    await registrarAuditoria(null, {
      usuari_id: adminId,
      modulo:    'Usuarios',
      accion:    `Estado actualizado — ${resultado.rows[0].usuari_no}: ${USUARI_ES}`,
      tipo:      'ALERTA',
    })

    res.json({ mensaje: 'Estado actualizado', registro: resultado.rows[0] })
  } catch (error) {
    console.error('Error en actualizarEstado:', error.message)
    res.status(500).json({ mensaje: 'Error al actualizar el estado del usuario' })
  }
}

// ── PATCH /api/usuarios/:id/rol ────────────────────────────────────────────────
const actualizarRol = async (req, res) => {
  const { id } = req.params
  const { ROLREG_ID } = req.body
  const { USUARI_ID: adminId } = req.usuario

  if (!ROLREG_ID) {
    return res.status(400).json({ mensaje: 'ROLREG_ID es obligatorio' })
  }

  try {
    const resultado = await pool.query(
      `UPDATE TM_USUARIO
       SET    ROLREG_ID = $1
       WHERE  USUARI_ID = $2
       RETURNING USUARI_ID, USUARI_NO, ROLREG_ID`,
      [ROLREG_ID, id]
    )

    if (resultado.rows.length === 0) {
      return res.status(404).json({ mensaje: 'Usuario no encontrado' })
    }

    await registrarAuditoria(null, {
      usuari_id: adminId,
      modulo:    'Usuarios',
      accion:    `Rol modificado — ${resultado.rows[0].usuari_no} → rol #${ROLREG_ID}`,
      tipo:      'ALERTA',
    })

    res.json({ mensaje: 'Rol actualizado', registro: resultado.rows[0] })
  } catch (error) {
    console.error('Error en actualizarRol:', error.message)
    res.status(500).json({ mensaje: 'Error al actualizar el rol del usuario' })
  }
}

module.exports = { obtenerUsuarios, crearUsuario, actualizarEstado, actualizarRol }
