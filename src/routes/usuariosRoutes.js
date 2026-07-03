const express = require('express')
const { obtenerUsuarios, crearUsuario, actualizarEstado, actualizarRol } = require('../controllers/usuariosController')
const { verificarToken } = require('../middlewares/authMiddleware')

const router = express.Router()

router.get('/',             verificarToken, obtenerUsuarios)
router.post('/',            verificarToken, crearUsuario)
router.patch('/:id/estado', verificarToken, actualizarEstado)
router.patch('/:id/rol',    verificarToken, actualizarRol)

module.exports = router
