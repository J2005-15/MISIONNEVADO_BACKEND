const jwt = require('jsonwebtoken')

const verificarToken = (req, res, next) => {
  const encabezado = req.headers['authorization']

  if (!encabezado || !encabezado.startsWith('Bearer ')) {
    return res.status(401).json({
      mensaje: 'Acceso denegado. Se requiere un token de autenticación.',
    })
  }

  const token = encabezado.split(' ')[1]

  try {
    const datosVerificados = jwt.verify(token, process.env.JWT_SECRET)
    req.usuario = datosVerificados  // { USUARI_ID, ROLREG_ID, iat, exp }
    next()
  } catch (error) {
    return res.status(401).json({
      mensaje: 'Token inválido o expirado. Inicie sesión nuevamente.',
    })
  }
}

// Para rutas públicas que usan tanto la web (sin sesión) como el panel (con
// sesión): si llega un token válido se carga req.usuario; si no, sigue sin él.
const tokenOpcional = (req, _res, next) => {
  const encabezado = req.headers['authorization']
  if (encabezado && encabezado.startsWith('Bearer ')) {
    try {
      req.usuario = jwt.verify(encabezado.split(' ')[1], process.env.JWT_SECRET)
    } catch { /* token inválido o vencido: se trata como visitante de la web */ }
  }
  next()
}

// ─── ROLES ────────────────────────────────────────────────────────────────────
// IDs de TM_ROLREG. Deben coincidir con los permisos que muestra el panel.
const ROL = { ADMINISTRADOR: 1, VETERINARIO: 2, CAMPO: 3 }

// Exige que el usuario (ya autenticado con verificarToken) tenga uno de los
// roles indicados. El rol y el estado se leen de la BD en cada petición: así
// un usuario suspendido o al que se le cambió el rol pierde el acceso al
// instante, sin esperar a que venza su token (8 h).
const permitirRoles = (...rolesPermitidos) => async (req, res, next) => {
  try {
    const { pool } = require('../config/db')
    const actual = (await pool.query(
      'SELECT ROLREG_ID, USUARI_ES FROM TM_USUARIO WHERE USUARI_ID = $1',
      [req.usuario?.USUARI_ID]
    )).rows[0]

    if (!actual || actual.usuari_es !== 'ACTIVO') {
      return res.status(401).json({ mensaje: 'Su cuenta no está activa. Inicie sesión nuevamente.' })
    }
    if (!rolesPermitidos.includes(Number(actual.rolreg_id))) {
      return res.status(403).json({ mensaje: 'No tiene permisos para realizar esta acción.' })
    }
    req.usuario.ROLREG_ID = actual.rolreg_id   // rol vigente, no el del token
    next()
  } catch (error) {
    console.error('Error verificando permisos:', error.message)
    res.status(500).json({ mensaje: 'No se pudieron verificar los permisos' })
  }
}

// ─── CONFIRMACIÓN CON CONTRASEÑA ─────────────────────────────────────────────
// Para eliminaciones: el usuario debe escribir SU contraseña (body { clave }).
// Responde 403 (no 401) si es incorrecta, para que el panel no cierre la sesión.
const confirmarConClave = async (req, res, next) => {
  const clave = req.body?.clave
  if (!clave) {
    return res.status(400).json({ mensaje: 'Escriba su contraseña para confirmar la eliminación.' })
  }
  try {
    const bcrypt = require('bcrypt')
    const { pool } = require('../config/db')
    const { registrarAuditoria } = require('../helpers/auditoria')
    const fila = (await pool.query(
      'SELECT USUARI_CL FROM TM_USUARIO WHERE USUARI_ID = $1', [req.usuario?.USUARI_ID]
    )).rows[0]

    if (!fila || !(await bcrypt.compare(String(clave), fila.usuari_cl))) {
      await registrarAuditoria(null, {
        usuari_id: req.usuario?.USUARI_ID,
        modulo:    'Seguridad',
        accion:    `Eliminación rechazada por contraseña incorrecta (${req.method} ${req.originalUrl})`,
        tipo:      'ALERTA',
        ip:        req.ip,
      })
      return res.status(403).json({ mensaje: 'Contraseña incorrecta. No se eliminó el registro.' })
    }
    next()
  } catch (error) {
    console.error('Error confirmando la contraseña:', error.message)
    res.status(500).json({ mensaje: 'No se pudo verificar la contraseña' })
  }
}

module.exports = { verificarToken, tokenOpcional, permitirRoles, confirmarConClave, ROL }
