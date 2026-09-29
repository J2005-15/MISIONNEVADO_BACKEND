const express = require('express')
const { validarId } = require('../middlewares/validaciones')
const { obtenerCatalogo, obtenerSolicitudes, recibirSolicitud, gestionarSolicitud, registrarPaciente, actualizarPaciente, cambiarFoto } = require('../controllers/adopcionesController')
const { verificarToken, permitirRoles, ROL } = require('../middlewares/authMiddleware')
const { recibirImagen } = require('../middlewares/uploadMiddleware')

const router = express.Router()
router.param('id', validarId)   // /recurso/abc → 400, no 500

// El módulo de Adopciones del panel es de Administrador y Personal de Campo
const gestionAdopciones = [verificarToken, permitirRoles(ROL.ADMINISTRADOR, ROL.CAMPO)]

// Públicas
router.get('/',              obtenerCatalogo)
router.post('/solicitar',    recibirSolicitud)
router.post('/solicitudes',  recibirSolicitud)   // ruta que usa el formulario de la web

// Administrativas
router.get('/solicitudes',     verificarToken, obtenerSolicitudes)
router.post('/',               ...gestionAdopciones, recibirImagen('foto'), registrarPaciente)
router.patch('/solicitud/:id', ...gestionAdopciones, gestionarSolicitud)
router.patch('/:id/foto',      ...gestionAdopciones, recibirImagen('foto'), cambiarFoto)
router.put('/:id',             ...gestionAdopciones, actualizarPaciente)

module.exports = router
