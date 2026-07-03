const express = require('express')
const { obtenerCatalogo, obtenerSolicitudes, recibirSolicitud, gestionarSolicitud, registrarPaciente } = require('../controllers/adopcionesController')
const { verificarToken } = require('../middlewares/authMiddleware')
const upload = require('../middlewares/uploadMiddleware')

const router = express.Router()

// Públicas
router.get('/',            obtenerCatalogo)
router.post('/solicitar',  recibirSolicitud)

// Administrativas
router.get('/solicitudes',     verificarToken, obtenerSolicitudes)
router.post('/',               verificarToken, upload.single('foto'), registrarPaciente)
router.patch('/solicitud/:id', verificarToken, gestionarSolicitud)

module.exports = router
