const express = require('express')
const { validarId } = require('../middlewares/validaciones')
const { obtenerUsuarios, crearUsuario, actualizarUsuario, actualizarEstado, actualizarRol } = require('../controllers/usuariosController')
const { verificarToken, permitirRoles, ROL } = require('../middlewares/authMiddleware')

const router = express.Router()
router.param('id', validarId)   // /recurso/abc → 400, no 500
const soloAdmin = [verificarToken, permitirRoles(ROL.ADMINISTRADOR)]

// Gestión de usuarios del panel: solo el Administrador
router.get('/',             ...soloAdmin, obtenerUsuarios)
router.post('/',            ...soloAdmin, crearUsuario)
router.put('/:id',          ...soloAdmin, actualizarUsuario)
router.patch('/:id/estado', ...soloAdmin, actualizarEstado)
router.patch('/:id/rol',    ...soloAdmin, actualizarRol)

module.exports = router
