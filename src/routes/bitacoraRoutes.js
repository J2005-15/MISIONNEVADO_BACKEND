const express               = require('express')
const { obtenerBitacora }   = require('../controllers/bitacoraController')
const { verificarToken, permitirRoles, ROL } = require('../middlewares/authMiddleware')

const router = express.Router()

// Bitácora de auditoría: solo el Administrador
router.get('/', verificarToken, permitirRoles(ROL.ADMINISTRADOR), obtenerBitacora)

module.exports = router
