const express = require('express')
const { obtenerVoluntarios, registrarVoluntario } = require('../controllers/voluntariosController')
const { verificarToken } = require('../middlewares/authMiddleware')

const router = express.Router()

router.get('/', verificarToken, obtenerVoluntarios)
router.post('/', registrarVoluntario) 

module.exports = router
