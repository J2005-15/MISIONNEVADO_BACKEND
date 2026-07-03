const express = require('express')
const { obtenerJornadas, crearJornada, eliminarJornada, registrarOperacion } = require('../controllers/jornadasController')
const { verificarToken } = require('../middlewares/authMiddleware')

const router = express.Router()

router.get('/',             verificarToken, obtenerJornadas)
router.post('/',            verificarToken, crearJornada)
router.delete('/:id',       verificarToken, eliminarJornada)
router.post('/operativa',   verificarToken, registrarOperacion)

module.exports = router
