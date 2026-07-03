const express = require('express')
const { obtenerDenuncias, registrarDenuncia, actualizarDenuncia } = require('../controllers/denunciasController')
const { verificarToken } = require('../middlewares/authMiddleware')

const router = express.Router()

router.post('/', registrarDenuncia)
router.get('/', verificarToken, obtenerDenuncias)
router.patch('/:id', verificarToken, actualizarDenuncia)

module.exports = router
