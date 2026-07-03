const express = require('express')
const { obtenerColaboraciones, registrarColaboracion, actualizarEstadoColab } = require('../controllers/colaboracionesController')
const { verificarToken } = require('../middlewares/authMiddleware')

const router = express.Router()

router.get('/',        verificarToken, obtenerColaboraciones)
router.post('/',                       registrarColaboracion)
router.patch('/:id',   verificarToken, actualizarEstadoColab)

module.exports = router
