const express = require('express')
const { login, obtenerPerfil, actualizarEmail, cambiarPassword } = require('../controllers/authController')
const { verificarToken } = require('../middlewares/authMiddleware')

const router = express.Router()

router.post('/login',            login)
router.get('/perfil',            verificarToken, obtenerPerfil)
router.patch('/perfil/email',    verificarToken, actualizarEmail)
router.patch('/perfil/password', verificarToken, cambiarPassword)

module.exports = router
