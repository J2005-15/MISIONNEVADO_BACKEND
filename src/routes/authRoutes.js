const express = require('express')
const {
  login, obtenerPerfil, actualizarEmail, cambiarPassword, actualizarTelefono,
  solicitarRecuperacion, restablecerClave,
} = require('../controllers/authController')
const { verificarToken } = require('../middlewares/authMiddleware')

const router = express.Router()

router.post('/login',            login)
router.get('/perfil',            verificarToken, obtenerPerfil)
router.patch('/perfil/email',    verificarToken, actualizarEmail)
router.patch('/perfil/password', verificarToken, cambiarPassword)
router.patch('/perfil/telefono', verificarToken, actualizarTelefono)

// Recuperación de contraseña desde el login (sin sesión)
router.post('/recuperar',   solicitarRecuperacion)
router.post('/restablecer', restablecerClave)

module.exports = router
