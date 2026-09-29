const express                          = require('express')
const { obtenerConfig, actualizarConfig, verConfigSistema, guardarConfigSistema } = require('../controllers/configController')
const { verificarToken, permitirRoles, ROL } = require('../middlewares/authMiddleware')

const router = express.Router()
const soloAdmin = [verificarToken, permitirRoles(ROL.ADMINISTRADOR)]

router.get('/',   ...soloAdmin, obtenerConfig)
router.patch('/', ...soloAdmin, actualizarConfig)

// Pantalla "Configuración del Sistema"
router.get('/sistema', ...soloAdmin, verConfigSistema)
router.put('/sistema', ...soloAdmin, guardarConfigSistema)

module.exports = router
