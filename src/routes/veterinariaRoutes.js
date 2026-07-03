const express = require('express')
const { obtenerConsultas, registrarConsulta, obtenerHistorial } = require('../controllers/veterinariaController')
const { verificarToken } = require('../middlewares/authMiddleware')

const router = express.Router()

router.get('/',                       verificarToken, obtenerConsultas)
router.post('/',                      verificarToken, registrarConsulta)
router.get('/historial/:id_censoa',   verificarToken, obtenerHistorial)

module.exports = router
