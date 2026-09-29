const bcrypt = require('bcrypt')
const { pool } = require('../config/db')
const { responderDatosInvalidos } = require('../helpers/erroresBD')
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
    if (responderDatosInvalidos(res, error)) return
    res.status(500).json({ mensaje: 'Error al obtener los usuarios del sistema' })
  }
}

// ── POST /api/usuarios ─────────────────────────────────────────────────────────
// Body: { PERSON_ID (cédula), ROLESG_ID, USUARI_NO, USUARI_CL, USUARI_EM, USUARI_ES?,
//         PERSON_NO? (nombre completo, obligatorio si la cédula no existe), PERSON_TL? }
const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const TELEFONO = /^[+\d][\d\s()-]{6,14}$/

const crearUsuario = async (req, res) => {
  const b = req.body ?? {}
  const PERSON_CE = String(b.PERSON_ID ?? '').trim()
  const USUARI_NO = String(b.USUARI_NO ?? '').trim()
  const USUARI_CL = String(b.USUARI_CL ?? '')
  const USUARI_EM = String(b.USUARI_EM ?? '').trim()
  const USUARI_ES = b.USUARI_ES || 'ACTIVO'
  const ROLESG_ID = Number(b.ROLESG_ID)
  const PERSON_NO = String(b.PERSON_NO ?? '').trim()
  const PERSON_TL = String(b.PERSON_TL ?? '').trim()
  const { USUARI_ID: adminId } = req.usuario

  if (!PERSON_CE || !USUARI_NO || !USUARI_CL || !ROLESG_ID || !USUARI_EM) {
    return res.status(400).json({ mensaje: 'Cédula, usuario, correo, contraseña y nivel de acceso son obligatorios' })
  }
  if (!CORREO.test(USUARI_EM)) return res.status(400).json({ mensaje: 'El correo electrónico no tiene un formato válido' })
  if (USUARI_CL.length < 8) return res.status(400).json({ mensaje: 'La contraseña debe tener al menos 8 caracteres' })
  if (!['ACTIVO', 'INACTIVO'].includes(USUARI_ES)) return res.status(400).json({ mensaje: 'El estado inicial debe ser Activo o Inactivo' })
  if (PERSON_TL && !TELEFONO.test(PERSON_TL)) return res.status(400).json({ mensaje: 'El teléfono no tiene un formato válido (ej. 0414-1234567)' })

  const cliente = await pool.connect()
  try {
    await cliente.query('BEGIN')

    // Datos personales: se vincula la persona de esa cédula o se crea
    let person_id = (await cliente.query(
      `SELECT PERSON_ID FROM TM_PERSON WHERE regexp_replace(PERSON_CE, '\\D', '', 'g') = $1 LIMIT 1`,
      [PERSON_CE.replace(/\D/g, '')]
    )).rows[0]?.person_id ?? null

    if (person_id) {
      await cliente.query(
        `UPDATE TM_PERSON SET
           PERSON_TL = COALESCE(NULLIF(PERSON_TL, ''), $2),
           PERSON_EM = COALESCE(NULLIF(PERSON_EM, ''), $3)
         WHERE PERSON_ID = $1`,
        [person_id, PERSON_TL || null, USUARI_EM]
      )
    } else {
      if (!PERSON_NO) {
        await cliente.query('ROLLBACK')
        return res.status(400).json({ mensaje: 'No hay datos registrados con esa cédula: escriba el nombre y apellido del titular' })
      }
      const partes = PERSON_NO.split(/\s+/)
      person_id = (await cliente.query(
        `INSERT INTO TM_PERSON (PERSON_CE, PERSON_NO, PERSON_AP, PERSON_TL, PERSON_EM)
         VALUES ($1, $2, $3, $4, $5) RETURNING PERSON_ID`,
        [PERSON_CE, partes[0], partes.slice(1).join(' ') || partes[0], PERSON_TL || null, USUARI_EM]
      )).rows[0].person_id
    }

    const hash = await bcrypt.hash(USUARI_CL, 12)

    const resultado = await cliente.query(
      `INSERT INTO TM_USUARIO (PERSON_ID, ROLREG_ID, USUARI_NO, USUARI_EM, USUARI_CL, USUARI_ES)
       VALUES ($1, $2, $3, $4, $5, $6::estado_usuario)
       RETURNING USUARI_ID, USUARI_NO, USUARI_EM, USUARI_ES, ROLREG_ID, USUARI_FE`,
      [person_id, ROLESG_ID, USUARI_NO, USUARI_EM, hash, USUARI_ES]
    )

    await registrarAuditoria(cliente, {
      usuari_id: adminId,
      modulo:    'Usuarios',
      accion:    `Nuevo usuario creado — ${USUARI_NO}`,
      tipo:      'INFO',
    })
    await cliente.query('COMMIT')

    res.status(201).json({
      mensaje:  'Usuario creado exitosamente',
      registro: { ...resultado.rows[0], person_ce: PERSON_CE },
    })
  } catch (error) {
    await cliente.query('ROLLBACK').catch(() => {})
    if (error.code === '23505') {
      return res.status(409).json({ mensaje: 'El nombre de usuario o correo ya está registrado' })
    }
    if (error.code === '23503') {
      return res.status(400).json({ mensaje: 'El nivel de acceso seleccionado no existe' })
    }
    console.error('Error en crearUsuario:', error.message)
    if (responderDatosInvalidos(res, error)) return
    res.status(500).json({ mensaje: 'Error al crear el usuario' })
  } finally {
    cliente.release()
  }
}

// ── PUT /api/usuarios/:id ──────────────────────────────────────────────────────
// Editar un usuario existente: { USUARI_NO, USUARI_EM, ROLREG_ID, PERSON_NO?, PERSON_TL? }
const actualizarUsuario = async (req, res) => {
  const { id } = req.params
  const b = req.body ?? {}
  const USUARI_NO = String(b.USUARI_NO ?? '').trim()
  const USUARI_EM = String(b.USUARI_EM ?? '').trim()
  const ROLREG_ID = Number(b.ROLREG_ID)
  const PERSON_NO = String(b.PERSON_NO ?? '').trim()
  const PERSON_TL = String(b.PERSON_TL ?? '').trim()
  const { USUARI_ID: adminId } = req.usuario

  if (!/^\d+$/.test(String(id))) return res.status(400).json({ mensaje: 'Usuario no válido' })
  if (!USUARI_NO || !USUARI_EM || !ROLREG_ID) {
    return res.status(400).json({ mensaje: 'Usuario, correo y nivel de acceso son obligatorios' })
  }
  if (!CORREO.test(USUARI_EM)) return res.status(400).json({ mensaje: 'El correo electrónico no tiene un formato válido' })
  if (PERSON_TL && !TELEFONO.test(PERSON_TL)) return res.status(400).json({ mensaje: 'El teléfono no tiene un formato válido (ej. 0414-1234567)' })

  const cliente = await pool.connect()
  try {
    await cliente.query('BEGIN')
    const actual = (await cliente.query(
      'SELECT USUARI_NO, ROLREG_ID, PERSON_ID FROM TM_USUARIO WHERE USUARI_ID = $1 FOR UPDATE', [id]
    )).rows[0]
    if (!actual) {
      await cliente.query('ROLLBACK')
      return res.status(404).json({ mensaje: 'Usuario no encontrado' })
    }
    // El administrador no puede quitarse su propio rol (el sistema quedaría sin administrador)
    if (Number(id) === Number(adminId) && ROLREG_ID !== Number(actual.rolreg_id)) {
      await cliente.query('ROLLBACK')
      return res.status(400).json({ mensaje: 'No puede cambiar su propio rol.' })
    }

    const resultado = await cliente.query(
      `UPDATE TM_USUARIO SET USUARI_NO = $1, USUARI_EM = $2, ROLREG_ID = $3
       WHERE USUARI_ID = $4
       RETURNING USUARI_ID, USUARI_NO, USUARI_EM, USUARI_ES, ROLREG_ID, USUARI_FE`,
      [USUARI_NO, USUARI_EM, ROLREG_ID, id]
    )

    if (actual.person_id) {
      const partes = PERSON_NO ? PERSON_NO.split(/\s+/) : null
      await cliente.query(
        `UPDATE TM_PERSON SET
           PERSON_NO = COALESCE($2, PERSON_NO),
           PERSON_AP = COALESCE($3, PERSON_AP),
           PERSON_TL = COALESCE($4, PERSON_TL),
           PERSON_EM = $5
         WHERE PERSON_ID = $1`,
        [actual.person_id, partes?.[0] ?? null, partes ? (partes.slice(1).join(' ') || partes[0]) : null, PERSON_TL || null, USUARI_EM]
      )
    }

    const cambioRol = ROLREG_ID !== Number(actual.rolreg_id)
    await registrarAuditoria(cliente, {
      usuari_id: adminId,
      modulo:    'Usuarios',
      accion:    `Usuario actualizado — ${USUARI_NO}${cambioRol ? ` (rol #${actual.rolreg_id} → #${ROLREG_ID})` : ''}`,
      tipo:      cambioRol ? 'ALERTA' : 'INFO',
    })
    await cliente.query('COMMIT')

    res.json({ mensaje: 'Usuario actualizado', registro: resultado.rows[0] })
  } catch (error) {
    await cliente.query('ROLLBACK').catch(() => {})
    if (error.code === '23505') {
      return res.status(409).json({ mensaje: 'El nombre de usuario o correo ya está registrado por otro usuario' })
    }
    if (error.code === '23503') {
      return res.status(400).json({ mensaje: 'El nivel de acceso seleccionado no existe' })
    }
    console.error('Error en actualizarUsuario:', error.message)
    if (responderDatosInvalidos(res, error)) return
    res.status(500).json({ mensaje: 'Error al actualizar el usuario' })
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
  // Evita que el administrador se bloquee a sí mismo y deje el sistema sin acceso
  if (Number(id) === Number(adminId) && USUARI_ES !== 'ACTIVO') {
    return res.status(400).json({ mensaje: 'No puede desactivar su propia cuenta.' })
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
    if (responderDatosInvalidos(res, error)) return
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
  if (Number(id) === Number(adminId)) {
    return res.status(400).json({ mensaje: 'No puede cambiar su propio rol.' })
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
    if (error.code === '23503') {
      return res.status(400).json({ mensaje: 'El rol seleccionado no existe' })
    }
    console.error('Error en actualizarRol:', error.message)
    if (responderDatosInvalidos(res, error)) return
    res.status(500).json({ mensaje: 'Error al actualizar el rol del usuario' })
  }
}

module.exports = { obtenerUsuarios, crearUsuario, actualizarUsuario, actualizarEstado, actualizarRol }
