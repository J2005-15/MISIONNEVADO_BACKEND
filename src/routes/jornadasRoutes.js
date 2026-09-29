const express = require('express')
const { validarId } = require('../middlewares/validaciones')
const { obtenerJornadas, obtenerJornadasPublicas, crearJornada, actualizarJornada, eliminarJornada, registrarOperacion } = require('../controllers/jornadasController')
const { verificarToken, permitirRoles, confirmarConClave, ROL } = require('../middlewares/authMiddleware')

const router = express.Router()
router.param('id', validarId)   // /recurso/abc → 400, no 500
const { ADMINISTRADOR, VETERINARIO } = ROL

// ?visibles=1 → listado público para la web (sin token); sin él → panel (con token)
router.get('/', (req, res, next) => (req.query.visibles ? obtenerJornadasPublicas(req, res) : next()),
                            verificarToken, obtenerJornadas)
// Planifican Administrador y Veterinario; solo el Administrador edita o elimina
router.post('/',            verificarToken, permitirRoles(ADMINISTRADOR, VETERINARIO), crearJornada)
router.put('/:id',          verificarToken, permitirRoles(ADMINISTRADOR), actualizarJornada)
router.delete('/:id',       verificarToken, permitirRoles(ADMINISTRADOR), confirmarConClave, eliminarJornada)
router.post('/operativa',   verificarToken, permitirRoles(ADMINISTRADOR, VETERINARIO), registrarOperacion)

module.exports = router
