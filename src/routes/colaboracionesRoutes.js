const express = require('express')
const { validarId } = require('../middlewares/validaciones')
const { obtenerColaboraciones, registrarColaboracion, actualizarEstadoColab, eliminarColaboracion } = require('../controllers/colaboracionesController')
const { verificarToken, permitirRoles, confirmarConClave, ROL } = require('../middlewares/authMiddleware')

const router = express.Router()
router.param('id', validarId)   // /recurso/abc → 400, no 500
const { ADMINISTRADOR, CAMPO } = ROL

// Colaboraciones: se registran solo desde el panel (antes esta ruta era pública)
router.get('/',        verificarToken, obtenerColaboraciones)
router.post('/',       verificarToken, permitirRoles(ADMINISTRADOR, CAMPO), registrarColaboracion)
router.patch('/:id',   verificarToken, permitirRoles(ADMINISTRADOR, CAMPO), actualizarEstadoColab)
router.delete('/:id',  verificarToken, permitirRoles(ADMINISTRADOR), confirmarConClave, eliminarColaboracion)

module.exports = router
