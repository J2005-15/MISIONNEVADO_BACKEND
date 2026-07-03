const express = require('express')
const cors = require('cors')

// Importación de Rutas (Resolución desde ./src/)
const authRoutes = require('./src/routes/authRoutes')
const adopcionesRoutes = require('./src/routes/adopcionesRoutes')
const denunciasRoutes = require('./src/routes/denunciasRoutes')
const voluntariosRoutes = require('./src/routes/voluntariosRoutes')
const proteccionistasRoutes = require('./src/routes/proteccionistasRoutes')
const censoRoutes = require('./src/routes/censoRoutes')
const veterinariaRoutes = require('./src/routes/veterinariaRoutes')
const inventarioRoutes = require('./src/routes/inventarioRoutes')
const bitacoraRoutes = require('./src/routes/bitacoraRoutes')
const rolesRoutes = require('./src/routes/rolesRoutes')
const configRoutes = require('./src/routes/configRoutes')
const jornadasRoutes = require('./src/routes/jornadasRoutes')
const colaboracionesRoutes = require('./src/routes/colaboracionesRoutes')
const usuariosRoutes = require('./src/routes/usuariosRoutes')
const catalogosRoutes = require('./src/routes/catalogosRoutes')

const app = express()

// ─── MIDDLEWARES GLOBALES ─────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}))
app.use(express.json())

// ─── MONTAJE DE RUTAS ─────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes)
app.use('/api/adopciones', adopcionesRoutes)
app.use('/api/denuncias', denunciasRoutes)
app.use('/api/voluntarios', voluntariosRoutes)
app.use('/api/proteccionistas', proteccionistasRoutes)
app.use('/api/censo', censoRoutes)
app.use('/api/veterinaria', veterinariaRoutes)
app.use('/api/inventario', inventarioRoutes)
app.use('/api/bitacora', bitacoraRoutes)
app.use('/api/roles', rolesRoutes)
app.use('/api/config', configRoutes)
app.use('/api/jornadas', jornadasRoutes)
app.use('/api/colaboraciones', colaboracionesRoutes)
app.use('/api/usuarios', usuariosRoutes)
app.use('/api/catalogos', catalogosRoutes)

// ─── RUTA DE VERIFICACIÓN ─────────────────────────────────────────────────────
app.get('/api/estado', (_req, res) => {
  res.json({
    sistema: 'SISVIC — Fundación Misión Nevado',
    estado: 'operativo',
    version: '2.0.0',
  })
})

// ─── MANEJO DE RUTAS NO ENCONTRADAS (404) ─────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    mensaje: 'La ruta solicitada no se encuentra disponible en el servidor.'
  })
})

// ─── MIDDLEWARE GLOBAL DE MANEJO DE ERRORES ───────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Error global detectado:', err.stack)
  res.status(500).json({
    mensaje: 'Ha ocurrido un error inesperado al procesar los datos de la solicitud.',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  })
})

module.exports = app
