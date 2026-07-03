const express = require('express')
const { obtenerProteccionistas, registrarProteccionista } = require('../controllers/proteccionistasController')
const { verificarToken } = require('../middlewares/authMiddleware')

const router = express.Router()

router.get('/', verificarToken, obtenerProteccionistas)
router.post('/', registrarProteccionista)

module.exports = router
