const express = require('express')
const { validarId } = require('../middlewares/validaciones')
const { obtenerDenuncias, registrarDenuncia, actualizarDenuncia } = require('../controllers/denunciasController')
const { verificarToken, permitirRoles, ROL } = require('../middlewares/authMiddleware')

const router = express.Router()
router.param('id', validarId)   // /recurso/abc → 400, no 500

router.post('/', registrarDenuncia)   // pública: formulario de la web (y panel)
router.get('/', verificarToken, obtenerDenuncias)
router.patch('/:id', verificarToken, permitirRoles(ROL.ADMINISTRADOR), actualizarDenuncia)   // cerrar caso

module.exports = router
