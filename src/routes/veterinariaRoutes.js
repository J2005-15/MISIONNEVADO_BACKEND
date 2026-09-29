const express = require('express')
const { validarId } = require('../middlewares/validaciones')
const { obtenerConsultas, registrarConsulta, obtenerHistorial } = require('../controllers/veterinariaController')
const { verificarToken, permitirRoles, ROL } = require('../middlewares/authMiddleware')

const router = express.Router()
router.param('id_censoa', validarId)   // /id_censoa/abc → 400, no 500

// Consultas médicas: las registran Veterinario y Administrador
router.get('/',                       verificarToken, obtenerConsultas)
router.post('/',                      verificarToken, permitirRoles(ROL.ADMINISTRADOR, ROL.VETERINARIO), registrarConsulta)
router.get('/historial/:id_censoa',   verificarToken, obtenerHistorial)

module.exports = router
