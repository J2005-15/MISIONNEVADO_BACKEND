const express = require('express')
const {
  obtenerContenido,
  actualizarHero,
  actualizarEstadisticas,
  actualizarContacto,
  actualizarAdopcionesVisibles,
  actualizarJornadasVisibles,
  subirImagenWeb,
} = require('../controllers/contenidoWebController')
const { verificarToken, permitirRoles, ROL } = require('../middlewares/authMiddleware')
const { recibirImagen } = require('../middlewares/uploadMiddleware')

const router = express.Router()
const soloAdmin = [verificarToken, permitirRoles(ROL.ADMINISTRADOR)]

// Pública — la consume la web
router.get('/', obtenerContenido)

// Administrativas — panel, módulo Contenido Web (solo Administrador)
router.post('/imagen',                ...soloAdmin, recibirImagen('imagen'), subirImagenWeb)
router.patch('/hero',                 ...soloAdmin, actualizarHero)
router.patch('/estadisticas',         ...soloAdmin, actualizarEstadisticas)
router.patch('/contacto',             ...soloAdmin, actualizarContacto)
router.patch('/adopciones-visibles',  ...soloAdmin, actualizarAdopcionesVisibles)
router.patch('/jornadas-visibles',    ...soloAdmin, actualizarJornadasVisibles)

module.exports = router
