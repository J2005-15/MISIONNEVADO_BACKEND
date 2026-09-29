const { pool } = require('../config/db')
const { responderDatosInvalidos } = require('../helpers/erroresBD')
const { registrarAuditoria } = require('../helpers/auditoria')
const { obtenerConfigSistema, validarConfigSistema, LIMITES } = require('../helpers/configSistema')

// ─── OBTENER PARÁMETROS DE CONFIGURACIÓN ─────────────────────────────────────
const obtenerConfig = async (_req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT CONFIG_ID, CONFIG_CL, CONFIG_VA, CONFIG_FE
       FROM   TM_CONFIG
       ORDER  BY CONFIG_CL ASC`
    )
    res.json({
      total:           resultado.rows.length,
      configuraciones: resultado.rows,
    })
  } catch (error) {
    console.error('Error en obtenerConfig:', error.message)
    if (responderDatosInvalidos(res, error)) return
    res.status(500).json({ mensaje: 'Error al obtener la configuración del sistema' })
  }
}

// ─── CREAR O ACTUALIZAR UN PARÁMETRO ─────────────────────────────────────────
const actualizarConfig = async (req, res) => {
  const { CONFIG_CL, CONFIG_VA } = req.body
  const { USUARI_ID } = req.usuario

  if (!CONFIG_CL || CONFIG_VA === undefined) {
    return res.status(400).json({ mensaje: 'CONFIG_CL y CONFIG_VA son obligatorios' })
  }

  try {
    const resultado = await pool.query(
      `INSERT INTO TM_CONFIG (CONFIG_CL, CONFIG_VA, USUARI_ID)
       VALUES ($1, $2, $3)
       ON CONFLICT (CONFIG_CL)
       DO UPDATE SET CONFIG_VA = EXCLUDED.CONFIG_VA,
                     USUARI_ID = EXCLUDED.USUARI_ID,
                     CONFIG_FE = NOW()
       RETURNING CONFIG_ID, CONFIG_CL, CONFIG_VA, CONFIG_FE`,
      [CONFIG_CL, CONFIG_VA, USUARI_ID]
    )

    res.json({
      mensaje:  'Configuración actualizada exitosamente',
      registro: resultado.rows[0],
    })
  } catch (error) {
    console.error('Error en actualizarConfig:', error.message)
    if (responderDatosInvalidos(res, error)) return
    res.status(500).json({ mensaje: 'Error al actualizar la configuración del sistema' })
  }
}

// ─── CONFIGURACIÓN DEL SISTEMA (pantalla propia del panel) ───────────────────
// GET /api/config/sistema
const verConfigSistema = async (_req, res) => {
  res.json({ configuracion: await obtenerConfigSistema(), limites: LIMITES })
}

// PUT /api/config/sistema  — body con la misma forma que devuelve el GET
const guardarConfigSistema = async (req, res) => {
  const { errores, filas } = validarConfigSistema(req.body?.configuracion ?? req.body)
  if (errores.length) return res.status(400).json({ mensaje: errores[0], errores })
  if (!filas.length)  return res.status(400).json({ mensaje: 'No se recibió ningún parámetro para guardar' })

  const cliente = await pool.connect()
  try {
    await cliente.query('BEGIN')
    for (const [clave, valor] of filas) {
      await cliente.query(
        `INSERT INTO TM_CONFIG (CONFIG_CL, CONFIG_VA, USUARI_ID)
         VALUES ($1, $2, $3)
         ON CONFLICT (CONFIG_CL)
         DO UPDATE SET CONFIG_VA = EXCLUDED.CONFIG_VA, USUARI_ID = EXCLUDED.USUARI_ID, CONFIG_FE = NOW()`,
        [clave, valor, req.usuario.USUARI_ID]
      )
    }
    await registrarAuditoria(cliente, {
      usuari_id: req.usuario.USUARI_ID,
      modulo:    'Configuración',
      accion:    'Configuración del sistema actualizada',
      tipo:      'ALERTA',
    })
    await cliente.query('COMMIT')
    res.json({ mensaje: 'Configuración guardada', configuracion: await obtenerConfigSistema() })
  } catch (error) {
    await cliente.query('ROLLBACK')
    console.error('Error en guardarConfigSistema:', error.message)
    if (responderDatosInvalidos(res, error)) return
    res.status(500).json({ mensaje: 'No se pudo guardar la configuración del sistema' })
  } finally {
    cliente.release()
  }
}

module.exports = { obtenerConfig, actualizarConfig, verConfigSistema, guardarConfigSistema }
