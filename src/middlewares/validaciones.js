// ─── VALIDACIONES COMUNES DE ENTRADA ─────────────────────────────────────────
// Rechazan con 400 (mensaje claro) datos que de otro modo llegarían a
// PostgreSQL y terminarían en un error 500.

const MAX_INT = 2147483647   // límite del tipo INTEGER de PostgreSQL

// Identificador positivo que cabe en un INTEGER
const esId = (v) => /^[1-9]\d{0,9}$/.test(String(v ?? '')) && Number(v) <= MAX_INT

// Para router.param('id', validarId): /recurso/abc, /recurso/1.5, /recurso/-1 → 400
const validarId = (req, res, next, valor) => {
  if (!esId(valor)) return res.status(400).json({ mensaje: 'El identificador del registro no es válido' })
  next()
}

// Campos del cuerpo que legítimamente son listas u objetos
const CAMPOS_ESTRUCTURADOS = new Set([
  'datos_colaboracion', 'detalles',          // colaboraciones
  'hero', 'estadisticas', 'contacto', 'visibles',   // contenido web
  'configuracion', 'avisos', 'institucion',   // configuración del sistema
])

// Un texto o número que llega como lista/objeto (p. ej. nombre: ["x"]) rompe
// las validaciones de los controladores: se rechaza aquí con 400.
const cuerpoPlano = (req, res, next) => {
  const cuerpo = req.body
  if (cuerpo && typeof cuerpo === 'object') {
    if (Array.isArray(cuerpo)) return res.status(400).json({ mensaje: 'La información enviada no tiene un formato válido.' })
    for (const [clave, valor] of Object.entries(cuerpo)) {
      if (valor !== null && typeof valor === 'object' && !CAMPOS_ESTRUCTURADOS.has(clave)) {
        return res.status(400).json({ mensaje: `El campo "${clave}" no tiene un formato válido.` })
      }
    }
  }
  next()
}

module.exports = { esId, validarId, cuerpoPlano, MAX_INT }
