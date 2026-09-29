// ─── ERRORES DE POSTGRESQL CAUSADOS POR DATOS INVÁLIDOS ───────────────────────
// Si el error viene de un dato mal enviado (texto en un campo numérico, fecha
// inexistente, valor fuera de rango, texto demasiado largo…) no es una falla
// del servidor: se responde 400 con un mensaje claro en vez de 500.
const MENSAJES = {
  '22P02': 'Uno de los datos enviados no tiene el formato correcto.',
  '22003': 'Uno de los valores numéricos está fuera del rango permitido.',
  '22007': 'Una de las fechas no es válida.',
  '22008': 'Una de las fechas no es válida.',
  '22001': 'Uno de los textos supera la longitud permitida (por ejemplo, el teléfono admite 15 caracteres).',
  '23502': 'Falta un dato obligatorio.',
  '23503': 'Uno de los datos hace referencia a un registro que no existe.',
  '23514': 'Uno de los valores enviados no está permitido.',
}

// Devuelve true si ya respondió (el controlador debe hacer `return`)
const responderDatosInvalidos = (res, error) => {
  if (res.headersSent) return false
  // Registro repetido (restricción de unicidad) → 409
  if (error?.code === '23505') {
    res.status(409).json({ mensaje: 'Ya existe un registro con esos datos.' })
    return true
  }
  const mensaje = MENSAJES[error?.code]
  if (!mensaje) return false
  res.status(400).json({ mensaje })
  return true
}

module.exports = { responderDatosInvalidos }
