const express                     = require('express')
const { obtenerRoles, asignarRol } = require('../controllers/rolesController')
const { verificarToken, permitirRoles, ROL } = require('../middlewares/authMiddleware')

const router = express.Router()
const soloAdmin = [verificarToken, permitirRoles(ROL.ADMINISTRADOR)]

router.get('/',          ...soloAdmin, obtenerRoles)
router.patch('/asignar', ...soloAdmin, asignarRol)

module.exports = router
