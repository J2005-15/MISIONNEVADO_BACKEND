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

module.exports = { verificarToken }
