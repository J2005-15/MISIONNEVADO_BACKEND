// Parámetros de la pantalla "Configuración del Sistema" del panel.
// Se guardan en TM_CONFIG con claves sistema_* (texto). Si una clave no existe
// se usa el valor por defecto, así el sistema funciona aunque nunca se hayan
// guardado cambios.
const { pool } = require('../config/db')

const LIMITES = {
  sesionHoras:         { min: 1, max: 24 },
  recuperacionMinutos: { min: 5, max: 60 },
}

const POR_DEFECTO = {
  avisos: { adopciones: true, registros: true, denuncias: true },
  sesionHoras:         8,
  recuperacionMinutos: 15,
  institucion: {
    nombre: 'Fundación Misión Nevado',
    lema:   'Misión Nevado · La Grita',
    firma:  '',
  },
}

// Clave de TM_CONFIG ↔ ruta dentro del objeto de configuración
const CLAVES = {
  sistema_avisos_adopciones:    ['avisos', 'adopciones'],
  sistema_avisos_registros:     ['avisos', 'registros'],
  sistema_avisos_denuncias:     ['avisos', 'denuncias'],
  sistema_sesion_horas:         ['sesionHoras'],
  sistema_recuperacion_minutos: ['recuperacionMinutos'],
  sistema_institucion_nombre:   ['institucion', 'nombre'],
  sistema_institucion_lema:     ['institucion', 'lema'],
  sistema_institucion_firma:    ['institucion', 'firma'],
}

const copiaPorDefecto = () => JSON.parse(JSON.stringify(POR_DEFECTO))

const leerValor = (ruta, texto) => {
  const base = ruta.reduce((o, k) => o[k], POR_DEFECTO)
  if (typeof base === 'boolean') return texto === 'true'
  if (typeof base === 'number') {
    const n = parseInt(texto, 10)
    const { min, max } = LIMITES[ruta[0]]
    return Number.isInteger(n) && n >= min && n <= max ? n : base
  }
  return texto ?? base
}

const asignar = (obj, ruta, valor) => {
  const ultimo = ruta[ruta.length - 1]
  ruta.slice(0, -1).reduce((o, k) => o[k], obj)[ultimo] = valor
}

// Nunca lanza error: ante cualquier falla devuelve los valores por defecto
const obtenerConfigSistema = async (cliente = pool) => {
  const config = copiaPorDefecto()
  try {
    const r = await cliente.query(`SELECT CONFIG_CL, CONFIG_VA FROM TM_CONFIG WHERE CONFIG_CL LIKE 'sistema\\_%'`)
    for (const { config_cl, config_va } of r.rows) {
      const ruta = CLAVES[config_cl]
      if (ruta) asignar(config, ruta, leerValor(ruta, config_va))
    }
  } catch (error) {
    console.error('No se pudo leer la configuración del sistema:', error.message)
  }
  return config
}

// Valida lo que envía el panel y devuelve { errores, filas: [[clave, valor], ...] }
const validarConfigSistema = (datos = {}) => {
  const errores = []
  const filas = []
  for (const [clave, ruta] of Object.entries(CLAVES)) {
    const valor = ruta.reduce((o, k) => (o == null ? undefined : o[k]), datos)
    if (valor === undefined) continue
    const base = ruta.reduce((o, k) => o[k], POR_DEFECTO)

    if (typeof base === 'boolean') {
      if (typeof valor !== 'boolean') { errores.push(`El aviso "${ruta[1]}" debe ser verdadero o falso`); continue }
      filas.push([clave, String(valor)])
    } else if (typeof base === 'number') {
      const n = Number(valor)
      const { min, max } = LIMITES[ruta[0]]
      if (!Number.isInteger(n) || n < min || n > max) {
        errores.push(ruta[0] === 'sesionHoras'
          ? `La duración de la sesión debe estar entre ${min} y ${max} horas`
          : `La vigencia del código debe estar entre ${min} y ${max} minutos`)
        continue
      }
      filas.push([clave, String(n)])
    } else {
      const texto = String(valor ?? '').trim()
      if (ruta[1] === 'nombre' && !texto) { errores.push('El nombre de la institución es obligatorio'); continue }
      if (texto.length > 300) { errores.push('Los textos de la institución no pueden superar 300 caracteres'); continue }
      filas.push([clave, texto])
    }
  }
  return { errores, filas }
}

module.exports = { obtenerConfigSistema, validarConfigSistema, LIMITES }
