require('dotenv').config({ quiet: true })
const app = require('./app')
const { verificarConexion } = require('./src/config/db')

const PORT = process.env.PORT || 3000

// ─── RED DE SEGURIDAD ─────────────────────────────────────────────────────────
// Una promesa rechazada que nadie atendió se registra en el log en vez de tumbar
// el servidor. Un error síncrono inesperado deja el proceso en estado incierto:
// se registra y se sale para que Render lo reinicie limpio.
process.on('unhandledRejection', (motivo) => {
  console.error('⚠️  Promesa rechazada sin manejar:', motivo instanceof Error ? motivo.stack : motivo)
})
process.on('uncaughtException', (error) => {
  console.error('❌ Error no controlado — reiniciando el servidor:', error.stack)
  process.exit(1)
})

// ─── ARRANQUE ASÍNCRONO DEL SERVIDOR ──────────────────────────────────────────
const iniciar = async () => {
  try {
    // 1. Verificamos la conexión con la base de datos (Neon)
    await verificarConexion()

    // 2. Levantamos el servidor en el puerto designado
    app.listen(PORT, () => {
      console.log(`🚀 Servidor SISVIC corriendo en http://localhost:${PORT}`)
    })
  } catch (error) {
    console.error('❌ Error crítico al arrancar el servidor:', error.message)
    process.exit(1)
  }
}

iniciar()
