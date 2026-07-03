const { Pool } = require('pg')

// ─── SELECCIÓN DE ENTORNO ─────────────────────────────────────────────────────
// Cambia DB_TARGET en .env: 'local' → PostgreSQL local | 'remote' → Neon
const esLocal = (process.env.DB_TARGET || 'local') === 'local'

const pool = esLocal
  ? new Pool({
      host:     process.env.DB_HOST_LOCAL,
      port:     Number(process.env.DB_PORT_LOCAL),
      database: process.env.DB_NAME_LOCAL,
      user:     process.env.DB_USER_LOCAL,
      password: String(process.env.DB_PASS_LOCAL),
      max:                  10,
      idleTimeoutMillis:    30000,
      connectionTimeoutMillis: 10000,
    })
  : new Pool({
      connectionString:        process.env.DB_URI_REMOTE,
      ssl:                     { rejectUnauthorized: false },
      max:                     5,
      idleTimeoutMillis:       20000,
      connectionTimeoutMillis: 10000,
    })

// Neon cierra conexiones idle — sin este handler el proceso crashea
pool.on('error', (err) => {
  console.error('⚠️  Conexión idle terminada por el servidor:', err.message)
})

// Códigos de error de red que aparecen cuando una VPN bloquea Neon
const CODIGOS_RED = ['ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED', 'ECONNRESET']

const verificarConexion = async () => {
  try {
    const cliente = await pool.connect()
    const origen  = esLocal
      ? `PostgreSQL local  →  ${process.env.DB_NAME_LOCAL}`
      : `Neon (remoto)     →  ${process.env.DB_NAME_REMOTE}`
    console.log(`✅  Conexión establecida con ${origen}`)
    cliente.release()
  } catch (error) {
    if (!esLocal && CODIGOS_RED.includes(error.code)) {
      console.error('❌  No se pudo conectar con Neon (base de datos remota).')
      console.error('⚠️   Causa probable: tienes una VPN activa.')
      console.error('     Neon bloquea conexiones enrutadas a través de VPN.')
      console.error('     → Desactiva la VPN y ejecuta "npm run dev" nuevamente.')
    } else {
      console.error('❌  Error al conectar con la base de datos:', error.message)
    }
    process.exit(1)
  }
}

module.exports = { pool, verificarConexion }
