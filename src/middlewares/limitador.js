const jwt = require('jsonwebtoken')

// ─── LIMITADOR DE INTENTOS POR IP (en memoria) ───────────────────────────────
// Frena el abuso sin afectar el uso normal: adivinar contraseñas en el login o
// llenar los formularios públicos de spam (lo que además gastaría la cuota de
// correos de EmailJS). Cada limitador lleva su propio conteo por IP.
//
//   ventanaMin    minutos de la ventana de conteo
//   maximo        peticiones permitidas en la ventana
//   soloFallidos  cuenta solo las respuestas con error (login, código de recuperación)
//   soloPublico   no limita a quien trae una sesión válida del panel
const crearLimitador = ({ ventanaMin, maximo, mensaje, soloFallidos = false, soloPublico = false }) => {
  const conteos = new Map()   // ip → { cuenta, reinicio }

  // Limpieza periódica para no acumular IPs viejas
  setInterval(() => {
    const ahora = Date.now()
    for (const [ip, r] of conteos) if (r.reinicio <= ahora) conteos.delete(ip)
  }, 60 * 1000).unref()

  const tieneSesion = (req) => {
    const encabezado = req.headers.authorization
    if (!encabezado?.startsWith('Bearer ')) return false
    try { jwt.verify(encabezado.slice(7), process.env.JWT_SECRET); return true } catch { return false }
  }

  return (req, res, next) => {
    if (soloPublico && tieneSesion(req)) return next()

    const ahora = Date.now()
    const ip = req.ip || 'desconocida'
    let r = conteos.get(ip)
    if (!r || r.reinicio <= ahora) {
      r = { cuenta: 0, reinicio: ahora + ventanaMin * 60 * 1000 }
      conteos.set(ip, r)
    }

    if (r.cuenta >= maximo) {
      res.set('Retry-After', String(Math.ceil((r.reinicio - ahora) / 1000)))
      return res.status(429).json({ mensaje })
    }

    if (soloFallidos) res.on('finish', () => { if (res.statusCode >= 400) r.cuenta++ })
    else r.cuenta++
    next()
  }
}

const MSG_ESPERA = (min) => `Demasiados intentos desde esta conexión. Espere ${min} minutos e intente de nuevo.`

// Límites del sistema (por IP)
const limites = {
  login:       crearLimitador({ ventanaMin: 15, maximo: 10, soloFallidos: true, mensaje: MSG_ESPERA(15) }),
  recuperar:   crearLimitador({ ventanaMin: 15, maximo: 5,  mensaje: MSG_ESPERA(15) }),
  restablecer: crearLimitador({ ventanaMin: 15, maximo: 20, soloFallidos: true, mensaje: MSG_ESPERA(15) }),
  // Formularios públicos de la web (cada uno con su propio conteo)
  formulario:  () => crearLimitador({ ventanaMin: 15, maximo: 20, soloPublico: true, mensaje: 'Se enviaron demasiados formularios desde esta conexión. Espere unos minutos e intente de nuevo.' }),
  seguimiento: crearLimitador({ ventanaMin: 15, maximo: 30, mensaje: MSG_ESPERA(15) }),
}

module.exports = { crearLimitador, limites }
