const express = require('express')
const { obtenerSectores, obtenerEspecies, obtenerRazas, obtenerColores, obtenerCategorias } = require('../controllers/catalogosController')
const { verificarToken } = require('../middlewares/authMiddleware')

const router = express.Router()

router.get('/sectores',   verificarToken, obtenerSectores)
router.get('/especies',   verificarToken, obtenerEspecies)
router.get('/razas',      verificarToken, obtenerRazas)
router.get('/colores',    verificarToken, obtenerColores)
router.get('/categorias', verificarToken, obtenerCategorias)

module.exports = router
