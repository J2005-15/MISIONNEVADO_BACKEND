const bcrypt = require('bcrypt')
const jwt    = require('jsonwebtoken')
const { pool } = require('../config/db')
const { registrarAuditoria } = require('../helpers/auditoria')

// ── POST /api/auth/login ───────────────────────────────────────────────────────
const login = async (req, res) => {
  const { USR_LOGIN, PWD_LOGIN } = req.body
  const ip = req.ip || req.connection?.remoteAddress || null

  if (!USR_LOGIN || !PWD_LOGIN) {
    return res.status(400).json({ mensaje: 'Usuario/correo y contraseña son obligatorios' })
  }

  try {
    const resultado = await pool.query(
      `SELECT u.USUARI_ID, u.USUARI_NO, u.USUARI_EM, u.USUARI_CL, u.USUARI_ES,
              u.ROLREG_ID, r.ROLREG_NO,
              p.PERSON_NO, p.PERSON_AP
       FROM   TM_USUARIO u
       JOIN   TM_ROLREG  r ON r.ROLREG_ID = u.ROLREG_ID
       LEFT JOIN TM_PERSON p ON p.PERSON_ID = u.PERSON_ID
       WHERE  u.USUARI_NO = $1 OR u.USUARI_EM = $1`,
      [USR_LOGIN.trim()]
    )

    if (resultado.rows.length === 0) {
      await registrarAuditoria(null, {
        modulo: 'Acceso',
        accion: `Intento fallido — usuario no encontrado: ${USR_LOGIN}`,
        tipo:   'ALERTA',
        ip,
      })
      return res.status(401).json({ mensaje: 'Credenciales incorrectas' })
    }

    const usuario = resultado.rows[0]

    if (usuario.usuari_es !== 'ACTIVO') {
      return res.status(403).json({
        mensaje: 'Cuenta inactiva o bloqueada. Comuníquese con el administrador.',
      })
    }

    const claveValida = await bcrypt.compare(PWD_LOGIN, usuario.usuari_cl)
    if (!claveValida) {
      await registrarAuditoria(null, {
        email:  usuario.usuari_em,
        rol:    usuario.rolreg_no,
        modulo: 'Acceso',
        accion: `Intento fallido — contraseña incorrecta: ${USR_LOGIN}`,
        tipo:   'ALERTA',
        ip,
      })
      return res.status(401).json({ mensaje: 'Credenciales incorrectas' })
    }

    const token = jwt.sign(
      { USUARI_ID: usuario.usuari_id, ROLREG_ID: usuario.rolreg_id },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    )

    await registrarAuditoria(null, {
      usuari_id: usuario.usuari_id,
      email:     usuario.usuari_em,
      rol:       usuario.rolreg_no,
      modulo:    'Acceso',
      accion:    'Inicio de sesión exitoso',
      tipo:      'INFO',
      ip,
    })

    res.json({
      mensaje: 'Inicio de sesión exitoso',
      token,
      usuario: {
        USUARI_ID: usuario.usuari_id,
        USUARI_NO: usuario.usuari_no,
        USUARI_EM: usuario.usuari_em,
        ROLREG_ID: usuario.rolreg_id,
        ROLREG_NO: usuario.rolreg_no,
        PERSON_NO: usuario.person_no,
        PERSON_AP: usuario.person_ap,
      },
    })
  } catch (error) {
    console.error('Error en login:', error.message)
    res.status(500).json({ mensaje: 'Error interno durante el inicio de sesión' })
  }
}

// ── GET /api/auth/perfil ───────────────────────────────────────────────────────
const obtenerPerfil = async (req, res) => {
  const { USUARI_ID } = req.usuario

  try {
    const resultado = await pool.query(
      `SELECT u.USUARI_ID, u.USUARI_NO, u.USUARI_EM, u.USUARI_ES,
              r.ROLREG_NO,
              p.PERSON_NO, p.PERSON_AP, p.PERSON_CE,
              p.PERSON_TL, p.PERSON_EM, p.PERSON_DI, p.PERSON_PA
       FROM   TM_USUARIO u
       JOIN   TM_ROLREG  r ON r.ROLREG_ID = u.ROLREG_ID
       LEFT JOIN TM_PERSON p ON p.PERSON_ID = u.PERSON_ID
       WHERE  u.USUARI_ID = $1`,
      [USUARI_ID]
    )

    if (resultado.rows.length === 0) {
      return res.status(404).json({ mensaje: 'Perfil no encontrado' })
    }

    const d = resultado.rows[0]
    res.json({
      USUARI_ID: d.usuari_id,
      USUARI_NO: d.usuari_no,
      USUARI_ES: d.usuari_es,
      ROLREG_NO: d.rolreg_no,
      email:     d.usuari_em,
      nombre:    d.person_no ? `${d.person_no} ${d.person_ap ?? ''}`.trim() : d.usuari_no,
      PERSON_NO: d.person_no,
      PERSON_AP: d.person_ap,
      PERSON_CE: d.person_ce,
      PERSON_TL: d.person_tl,
      PERSON_EM: d.person_em,
      PERSON_DI: d.person_di,
      PERSON_PA: d.person_pa,
    })
  } catch (error) {
    console.error('Error en obtenerPerfil:', error.message)
    res.status(500).json({ mensaje: 'Error al obtener el perfil' })
  }
}

// ── PATCH /api/auth/perfil/email ───────────────────────────────────────────────
const actualizarEmail = async (req, res) => {
  const { USUARI_ID } = req.usuario
  const { email }     = req.body

  if (!email || !email.trim()) {
    return res.status(400).json({ mensaje: 'El correo electrónico es obligatorio' })
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return res.status(400).json({ mensaje: 'El correo electrónico no tiene un formato válido' })
  }

  const cliente = await pool.connect()
  try {
    await cliente.query('BEGIN')

    const resUsuario = await cliente.query(
      `UPDATE TM_USUARIO
       SET    USUARI_EM = $1
       WHERE  USUARI_ID = $2
       RETURNING USUARI_ID, USUARI_EM`,
      [email.trim(), USUARI_ID]
    )

    if (resUsuario.rows.length === 0) {
      await cliente.query('ROLLBACK')
      return res.status(404).json({ mensaje: 'Usuario no encontrado' })
    }

    // Sincronizar PERSON_EM si existe registro vinculado
    await cliente.query(
      `UPDATE TM_PERSON
       SET    PERSON_EM = $1
       WHERE  PERSON_ID = (
         SELECT PERSON_ID FROM TM_USUARIO
         WHERE  USUARI_ID = $2 AND PERSON_ID IS NOT NULL
       )`,
      [email.trim(), USUARI_ID]
    )

    await cliente.query('COMMIT')

    res.json({
      mensaje:   'Correo actualizado correctamente',
      USUARI_EM: resUsuario.rows[0].usuari_em,
    })
  } catch (error) {
    await cliente.query('ROLLBACK')
    if (error.code === '23505') {
      return res.status(409).json({ mensaje: 'Este correo ya está registrado por otro usuario' })
    }
    console.error('Error en actualizarEmail:', error.message)
    res.status(500).json({ mensaje: 'Error al actualizar el correo' })
  } finally {
    cliente.release()
  }
}

// ── PATCH /api/auth/perfil/password ───────────────────────────────────────────
const cambiarPassword = async (req, res) => {
  const { USUARI_ID }   = req.usuario
  const { actual, nueva } = req.body

  if (!actual || !nueva) {
    return res.status(400).json({ mensaje: 'La contraseña actual y la nueva son obligatorias' })
  }
  if (nueva.length < 8) {
    return res.status(400).json({ mensaje: 'La nueva contraseña debe tener al menos 8 caracteres' })
  }

  try {
    const resultado = await pool.query(
      `SELECT USUARI_CL FROM TM_USUARIO WHERE USUARI_ID = $1`,
      [USUARI_ID]
    )

    if (resultado.rows.length === 0) {
      return res.status(404).json({ mensaje: 'Usuario no encontrado' })
    }

    const claveValida = await bcrypt.compare(actual, resultado.rows[0].usuari_cl)
    if (!claveValida) {
      return res.status(401).json({ mensaje: 'Contraseña actual incorrecta' })
    }

    const nuevoHash = await bcrypt.hash(nueva, 12)

    await pool.query(
      `UPDATE TM_USUARIO SET USUARI_CL = $1 WHERE USUARI_ID = $2`,
      [nuevoHash, USUARI_ID]
    )

    res.json({ mensaje: 'Contraseña actualizada correctamente' })
  } catch (error) {
    console.error('Error en cambiarPassword:', error.message)
    res.status(500).json({ mensaje: 'Error al cambiar la contraseña' })
  }
}

module.exports = { login, obtenerPerfil, actualizarEmail, cambiarPassword }
