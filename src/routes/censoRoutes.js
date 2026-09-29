const express = require('express')
const { validarId } = require('../middlewares/validaciones')
const { obtenerCenso, registrarCenso, actualizarCenso, eliminarCenso } = require('../controllers/censoController')
const { verificarToken, permitirRoles, confirmarConClave, ROL } = require('../middlewares/authMiddleware')

const router = express.Router()
router.param('id', validarId)   // /recurso/abc → 400, no 500
const { ADMINISTRADOR, VETERINARIO, CAMPO } = ROL

// Censo: todos los roles registran y editan; solo el Administrador elimina
router.get('/',       verificarToken, obtenerCenso)
router.post('/',      verificarToken, permitirRoles(ADMINISTRADOR, VETERINARIO, CAMPO), registrarCenso)
router.put('/:id',    verificarToken, permitirRoles(ADMINISTRADOR, VETERINARIO, CAMPO), actualizarCenso)
router.delete('/:id', verificarToken, permitirRoles(ADMINISTRADOR), confirmarConClave, eliminarCenso)

module.exports = router
