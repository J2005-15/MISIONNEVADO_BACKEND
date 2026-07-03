const express = require('express')
const { obtenerCenso, registrarCenso } = require('../controllers/censoController')
const { verificarToken } = require('../middlewares/authMiddleware')

const router = express.Router()

router.get('/', verificarToken, obtenerCenso)
router.post('/', verificarToken, registrarCenso)

module.exports = router
