const express = require('express')
const { validarId } = require('../middlewares/validaciones')
const { obtenerVoluntarios, registrarVoluntario, actualizarEstadoVoluntario, actualizarVoluntario, eliminarVoluntario } = require('../controllers/voluntariosController')
const { verificarToken, tokenOpcional, permitirRoles, confirmarConClave, ROL } = require('../middlewares/authMiddleware')

const router = express.Router()
router.param('id', validarId)   // /recurso/abc → 400, no 500
const soloAdmin = [verificarToken, permitirRoles(ROL.ADMINISTRADOR)]

router.get('/', verificarToken, obtenerVoluntarios)
router.post('/', tokenOpcional, registrarVoluntario)   // web (sin sesión) y panel (con sesión)
// Aprobar, editar y eliminar: solo el Administrador
router.patch('/:id/estado', ...soloAdmin, actualizarEstadoVoluntario)
router.put('/:id',          ...soloAdmin, actualizarVoluntario)
router.delete('/:id',       ...soloAdmin, confirmarConClave, eliminarVoluntario)

module.exports = router
