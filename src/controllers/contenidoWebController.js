const { pool } = require('../config/db')
const { responderDatosInvalidos } = require('../helpers/erroresBD')
const { registrarAuditoria } = require('../helpers/auditoria')
const { subirImagen } = require('../helpers/subirImagen')

// El contenido editable de la web pública vive en TM_CONFIG como pares
// clave/valor: hero_<campo>, contacto_<campo> y 'estadisticas' (JSON).
const CAMPOS_HERO     = ['badge', 'titulo_inicio', 'titulo_acento', 'titulo_fin', 'descripcion', 'imagen_url', 'imagen_frontal_url']
const CAMPOS_CONTACTO = ['descripcion', 'direccion', 'telefono', 'email', 'horario']
const ROL_ADMINISTRADOR = 1

const soloAdministrador = (req, res) => {
  if (Number(req.usuario?.ROLREG_ID) !== ROL_ADMINISTRADOR) {
    res.status(403).json({ mensaje: 'Solo el Administrador puede editar el contenido web' })
    return false
  }
  return true
}

// Inserta o actualiza varias claves de TM_CONFIG en una sola transacción
const guardarClaves = async (pares, usuariId) => {
  const cliente = await pool.connect()
  try {
    await cliente.query('BEGIN')
    for (const [clave, valor] of pares) {
      await cliente.query(
        `INSERT INTO TM_CONFIG (CONFIG_CL, CONFIG_VA, USUARI_ID)
         VALUES ($1, $2, $3)
         ON CONFLICT (CONFIG_CL)
         DO UPDATE SET CONFIG_VA = EXCLUDED.CONFIG_VA,
                       USUARI_ID = EXCLUDED.USUARI_ID,
                       CONFIG_FE = NOW()`,
        [clave, valor, usuariId]
      )
    }
    await cliente.query('COMMIT')
  } catch (error) {
    await cliente.query('ROLLBACK')
    throw error
  } finally {
    cliente.release()
  }
}

// ─── GET /api/contenido-web (público) ────────────────────────────────────────
const obtenerContenido = async (_req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT CONFIG_CL, CONFIG_VA FROM TM_CONFIG
       WHERE  CONFIG_CL LIKE 'hero\\_%' OR CONFIG_CL LIKE 'contacto\\_%' OR CONFIG_CL = 'estadisticas'`
    )
    const config = Object.fromEntries(resultado.rows.map((r) => [r.config_cl, r.config_va]))

    const hero = {}
    for (const campo of CAMPOS_HERO) {
      if (config[`hero_${campo}`] !== undefined) hero[campo] = config[`hero_${campo}`]
    }
    const contacto = {}
    for (const campo of CAMPOS_CONTACTO) {
      if (config[`contacto_${campo}`] !== undefined) contacto[campo] = config[`contacto_${campo}`]
    }
    let estadisticas = []
    try { estadisticas = JSON.parse(config.estadisticas || '[]') } catch { /* valor corrupto → vacío */ }

    res.json({ hero, estadisticas, contacto })
  } catch (error) {
    console.error('Error en obtenerContenido:', error.message)
    if (responderDatosInvalidos(res, error)) return
    res.status(500).json({ mensaje: 'Error al obtener el contenido web' })
  }
}

// ─── PATCH /api/contenido-web/hero  { hero } ─────────────────────────────────
const actualizarHero = async (req, res) => {
  if (!soloAdministrador(req, res)) return
  const { hero } = req.body
  if (!hero || typeof hero !== 'object') {
    return res.status(400).json({ mensaje: 'Debe enviar el objeto hero' })
  }

  const pares = CAMPOS_HERO
    .filter((campo) => typeof hero[campo] === 'string')
    .map((campo) => [`hero_${campo}`, hero[campo]])

  try {
    await guardarClaves(pares, req.usuario.USUARI_ID)
    await registrarAuditoria(null, {
      usuari_id: req.usuario.USUARI_ID, modulo: 'CONTENIDO_WEB',
      accion: 'Sección Hero de la web actualizada', tipo: 'INFO', ip: req.ip,
    })
    res.json({ mensaje: 'Sección Hero publicada correctamente' })
  } catch (error) {
    console.error('Error en actualizarHero:', error.message)
    if (responderDatosInvalidos(res, error)) return
    res.status(500).json({ mensaje: 'Error al guardar la sección Hero' })
  }
}

// ─── PATCH /api/contenido-web/estadisticas  { estadisticas: [...] } ──────────
const actualizarEstadisticas = async (req, res) => {
  if (!soloAdministrador(req, res)) return
  const { estadisticas } = req.body
  if (!Array.isArray(estadisticas)) {
    return res.status(400).json({ mensaje: 'estadisticas debe ser una lista' })
  }

  const limpias = estadisticas.map(({ id, valor, etiqueta }) => ({ id, valor, etiqueta }))

  try {
    await guardarClaves([['estadisticas', JSON.stringify(limpias)]], req.usuario.USUARI_ID)
    await registrarAuditoria(null, {
      usuari_id: req.usuario.USUARI_ID, modulo: 'CONTENIDO_WEB',
      accion: 'Estadísticas de la web actualizadas', tipo: 'INFO', ip: req.ip,
    })
    res.json({ mensaje: 'Estadísticas actualizadas' })
  } catch (error) {
    console.error('Error en actualizarEstadisticas:', error.message)
    if (responderDatosInvalidos(res, error)) return
    res.status(500).json({ mensaje: 'Error al guardar las estadísticas' })
  }
}

// ─── PATCH /api/contenido-web/contacto  { contacto } ─────────────────────────
const actualizarContacto = async (req, res) => {
  if (!soloAdministrador(req, res)) return
  const { contacto } = req.body
  if (!contacto || typeof contacto !== 'object') {
    return res.status(400).json({ mensaje: 'Debe enviar el objeto contacto' })
  }

  const pares = CAMPOS_CONTACTO
    .filter((campo) => typeof contacto[campo] === 'string')
    .map((campo) => [`contacto_${campo}`, contacto[campo]])

  try {
    await guardarClaves(pares, req.usuario.USUARI_ID)
    await registrarAuditoria(null, {
      usuari_id: req.usuario.USUARI_ID, modulo: 'CONTENIDO_WEB',
      accion: 'Información de contacto de la web actualizada', tipo: 'INFO', ip: req.ip,
    })
    res.json({ mensaje: 'Información de contacto actualizada' })
  } catch (error) {
    console.error('Error en actualizarContacto:', error.message)
    if (responderDatosInvalidos(res, error)) return
    res.status(500).json({ mensaje: 'Error al guardar la información de contacto' })
  }
}

// ─── PATCH /api/contenido-web/{adopciones|jornadas}-visibles  { visibles: [ids] }
// Marca como visibles en la web exactamente los IDs recibidos; el resto se oculta.
const actualizarVisibles = (tabla, columnaId, columnaVisible, etiqueta) => async (req, res) => {
  if (!soloAdministrador(req, res)) return
  const { visibles } = req.body
  if (!Array.isArray(visibles)) {
    return res.status(400).json({ mensaje: 'visibles debe ser una lista de IDs' })
  }
  const ids = visibles.map(Number).filter(Number.isInteger)

  try {
    await pool.query(
      `UPDATE ${tabla} SET ${columnaVisible} = (${columnaId} = ANY($1::int[]))`,
      [ids]
    )
    await registrarAuditoria(null, {
      usuari_id: req.usuario.USUARI_ID, modulo: 'CONTENIDO_WEB',
      accion: `${etiqueta} visibles en la web: ${ids.length}`, tipo: 'INFO', ip: req.ip,
    })
    res.json({ mensaje: `${ids.length} ${etiqueta.toLowerCase()} visibles en la web`, visibles: ids })
  } catch (error) {
    console.error(`Error al actualizar visibilidad (${tabla}):`, error.message)
    if (responderDatosInvalidos(res, error)) return
    res.status(500).json({ mensaje: 'Error al guardar la visibilidad' })
  }
}

const actualizarAdopcionesVisibles = actualizarVisibles('TM_ADOPCI', 'ADOPCI_ID', 'ADOPCI_VW', 'Pacientes')
const actualizarJornadasVisibles   = actualizarVisibles('TT_JORNAD', 'JORNAD_ID', 'JORNAD_VW', 'Jornadas')

// ─── POST /api/contenido-web/imagen  (campo 'imagen') ────────────────────────
// Sube una imagen del hero (fondo o frontal) a Cloudinary y devuelve su URL;
// queda publicada al guardar la sección Hero con esa URL.
const subirImagenWeb = async (req, res) => {
  if (!soloAdministrador(req, res)) return
  if (!req.file) {
    return res.status(400).json({ mensaje: 'Debe seleccionar una imagen' })
  }
  try {
    const url = await subirImagen(req.file.buffer, 'sisvic/web')
    res.status(201).json({ mensaje: 'Imagen subida', url })
  } catch (error) {
    console.error('Error subiendo imagen del hero a Cloudinary:', error.message)
    res.status(502).json({ mensaje: 'No se pudo subir la imagen al almacenamiento. Intente de nuevo.' })
  }
}

module.exports = {
  subirImagenWeb,
  obtenerContenido,
  actualizarHero,
  actualizarEstadisticas,
  actualizarContacto,
  actualizarAdopcionesVisibles,
  actualizarJornadasVisibles,
}
