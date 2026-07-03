const { pool } = require('../config/db')

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
    res.status(500).json({ mensaje: 'Error al actualizar la configuración del sistema' })
  }
}

module.exports = { obtenerConfig, actualizarConfig }
