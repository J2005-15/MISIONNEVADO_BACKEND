const express                                        = require('express')
const { registrarVoluntario, registrarProteccionista } = require('../controllers/actoresController')

const router = express.Router()

router.post('/voluntarios',     registrarVoluntario)
router.post('/proteccionistas', registrarProteccionista)

module.exports = router
