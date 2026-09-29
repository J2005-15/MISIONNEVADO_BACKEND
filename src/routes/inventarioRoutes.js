const express = require('express')
const { validarId } = require('../middlewares/validaciones')
const { obtenerInsumos, consumirInsumo, crearInsumo, registrarMovimientoInsumo, historialInsumo } = require('../controllers/inventarioController')
const { verificarToken, permitirRoles, ROL } = require('../middlewares/authMiddleware')

const router = express.Router()
router.param('id', validarId)   // /recurso/abc → 400, no 500

// Logística: el Administrador registra insumos y ajusta stock; Administrador y Veterinario registran consumo
router.get('/',                   verificarToken, obtenerInsumos)
router.post('/',                  verificarToken, permitirRoles(ROL.ADMINISTRADOR), crearInsumo)
router.post('/consumo',           verificarToken, permitirRoles(ROL.ADMINISTRADOR, ROL.VETERINARIO), consumirInsumo)
router.post('/:id/movimiento',    verificarToken, permitirRoles(ROL.ADMINISTRADOR), registrarMovimientoInsumo)
router.get('/:id/movimientos',    verificarToken, permitirRoles(ROL.ADMINISTRADOR, ROL.VETERINARIO), historialInsumo)

module.exports = router
