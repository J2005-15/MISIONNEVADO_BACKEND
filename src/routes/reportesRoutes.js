const express = require('express')
const { reporteSistema } = require('../controllers/reportesController')
const { verificarToken, permitirRoles, ROL } = require('../middlewares/authMiddleware')

const router = express.Router()

// Reporte general (resumen + movimientos de censo y stock + bitácora): solo Administrador
router.get('/sistema', verificarToken, permitirRoles(ROL.ADMINISTRADOR), reporteSistema)

module.exports = router
