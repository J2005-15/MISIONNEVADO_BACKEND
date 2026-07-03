const express = require('express')
const { obtenerInsumos, consumirInsumo, crearInsumo } = require('../controllers/inventarioController')
const { verificarToken } = require('../middlewares/authMiddleware')

const router = express.Router()

router.get('/',        verificarToken, obtenerInsumos)
router.post('/',       verificarToken, crearInsumo)
router.post('/consumo', verificarToken, consumirInsumo)

module.exports = router
