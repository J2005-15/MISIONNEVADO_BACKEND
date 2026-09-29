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
const contenidoWebRoutes = require('./src/routes/contenidoWebRoutes')
const seguimientoRoutes = require('./src/routes/seguimientoRoutes')
const reportesRoutes = require('./src/routes/reportesRoutes')

const { limites } = require('./src/middlewares/limitador')

const app = express()

// Render (y Netlify) atienden detrás de un proxy: así req.ip es la IP real del
// usuario (bitácora y límite de intentos) y no la del proxy
app.set('trust proxy', 1)

// ─── MIDDLEWARES GLOBALES ─────────────────────────────────────────────────────
// FRONTEND_URL admite varios orígenes separados por coma (dashboard + web pública)
const origenesPermitidos = (process.env.FRONTEND_URL || '')
  .split(',')
  .map((o) => o.trim().replace(/\/$/, ''))
  .filter(Boolean)

app.use(cors({
  origin: origenesPermitidos.length ? origenesPermitidos : '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}))
app.use(express.json())
app.use(require('./src/middlewares/validaciones').cuerpoPlano)

// ─── LÍMITE DE INTENTOS (antes de las rutas) ─────────────────────────────────
app.post('/api/auth/login',       limites.login)
app.post('/api/auth/recuperar',   limites.recuperar)
app.post('/api/auth/restablecer', limites.restablecer)
app.post(['/api/adopciones/solicitudes', '/api/adopciones/solicitar'], limites.formulario())
app.post('/api/denuncias',        limites.formulario())
app.post('/api/voluntarios',      limites.formulario())
app.post('/api/proteccionistas',  limites.formulario())
app.get('/api/seguimiento',       limites.seguimiento)

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
app.use('/api/contenido-web', contenidoWebRoutes)
app.use('/api/seguimiento', seguimientoRoutes)
app.use('/api/reportes', reportesRoutes)

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
  // Errores del cliente (no del servidor): JSON mal formado o cuerpo demasiado grande
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ mensaje: 'La información enviada no tiene un formato válido.' })
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ mensaje: 'La información enviada es demasiado grande.' })
  }
  console.error('Error global detectado:', err.stack)
  res.status(500).json({
    mensaje: 'Ha ocurrido un error inesperado al procesar los datos de la solicitud.',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  })
})

module.exports = app
