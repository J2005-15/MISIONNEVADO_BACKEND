const express = require('express')
const { validarId } = require('../middlewares/validaciones')
const { obtenerProteccionistas, registrarProteccionista, actualizarEstadoProteccionista, actualizarProteccionista, eliminarProteccionista } = require('../controllers/proteccionistasController')
const { verificarToken, tokenOpcional, permitirRoles, confirmarConClave, ROL } = require('../middlewares/authMiddleware')

const router = express.Router()
router.param('id', validarId)   // /recurso/abc → 400, no 500
const soloAdmin = [verificarToken, permitirRoles(ROL.ADMINISTRADOR)]

router.get('/', verificarToken, obtenerProteccionistas)
router.post('/', tokenOpcional, registrarProteccionista)   // web (sin sesión) y panel (con sesión)
// Aprobar, editar y eliminar: solo el Administrador
router.patch('/:id/estado', ...soloAdmin, actualizarEstadoProteccionista)
router.put('/:id',          ...soloAdmin, actualizarProteccionista)
router.delete('/:id',       ...soloAdmin, confirmarConClave, eliminarProteccionista)

module.exports = router
