const express = require('express')
const { consultarSeguimiento } = require('../controllers/seguimientoController')

const router = express.Router()

// Pública — "Consulta de Seguimiento" de la web (por cédula o correo)
router.get('/', consultarSeguimiento)

module.exports = router
