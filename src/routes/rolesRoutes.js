const express                     = require('express')
const { obtenerRoles, asignarRol } = require('../controllers/rolesController')
const { verificarToken }           = require('../middlewares/authMiddleware')

const router = express.Router()

router.get('/',          verificarToken, obtenerRoles)
router.patch('/asignar', verificarToken, asignarRol)

module.exports = router
