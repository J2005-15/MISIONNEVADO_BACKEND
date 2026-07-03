require('dotenv').config({ quiet: true })
const app = require('./app')
const { verificarConexion } = require('./src/config/db')

const PORT = process.env.PORT || 3000

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
