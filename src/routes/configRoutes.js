const express                          = require('express')
const { obtenerConfig, actualizarConfig } = require('../controllers/configController')
const { verificarToken }               = require('../middlewares/authMiddleware')

const router = express.Router()

router.get('/',  verificarToken, obtenerConfig)
router.patch('/', verificarToken, actualizarConfig)

module.exports = router
