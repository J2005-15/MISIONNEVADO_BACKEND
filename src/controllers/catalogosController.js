const { pool } = require('../config/db')

// ── GET /api/catalogos/sectores ────────────────────────────────────────────────
const obtenerSectores = async (_req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT SECTOR_ID, SECTOR_NO, SECTOR_MU
       FROM   TM_SECTOR
       WHERE  SECTOR_ES = 'Activo'
       ORDER  BY SECTOR_NO ASC`
    )
    res.json({ registros: resultado.rows })
  } catch (error) {
    console.error('Error en obtenerSectores:', error.message)
    res.status(500).json({ mensaje: 'Error al obtener los sectores' })
  }
}

// ── GET /api/catalogos/especies ────────────────────────────────────────────────
const obtenerEspecies = async (_req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT ESPECI_ID, ESPECI_NO
       FROM   TM_ESPECI
       ORDER  BY ESPECI_NO ASC`
    )
    res.json({ registros: resultado.rows })
  } catch (error) {
    console.error('Error en obtenerEspecies:', error.message)
    res.status(500).json({ mensaje: 'Error al obtener las especies' })
  }
}

// ── GET /api/catalogos/razas?especie=Canino ────────────────────────────────────
const obtenerRazas = async (req, res) => {
  const { especie } = req.query

  const condicion = especie ? `WHERE e.ESPECI_NO = $1` : ''
  const valores   = especie ? [especie] : []

  try {
    const resultado = await pool.query(
      `SELECT r.RAZARE_ID, r.RAZARE_NO, e.ESPECI_NO
       FROM   TM_RAZARE r
       JOIN   TM_ESPECI e ON e.ESPECI_ID = r.ESPECI_ID
       ${condicion}
       ORDER  BY r.RAZARE_NO ASC`,
      valores
    )
    res.json({ registros: resultado.rows })
  } catch (error) {
    console.error('Error en obtenerRazas:', error.message)
    res.status(500).json({ mensaje: 'Error al obtener las razas' })
  }
}

// ── GET /api/catalogos/colores ─────────────────────────────────────────────────
const obtenerColores = async (_req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT COLORE_ID, COLORE_NO
       FROM   TM_COLORE
       ORDER  BY COLORE_NO ASC`
    )
    res.json({ registros: resultado.rows })
  } catch (error) {
    console.error('Error en obtenerColores:', error.message)
    res.status(500).json({ mensaje: 'Error al obtener los colores' })
  }
}

// ── GET /api/catalogos/categorias ──────────────────────────────────────────────
const obtenerCategorias = async (_req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT CATEGO_ID, CATEGO_NO FROM TM_CATEGO ORDER BY CATEGO_NO ASC`
    )
    res.json({ registros: resultado.rows })
  } catch (error) {
    console.error('Error en obtenerCategorias:', error.message)
    res.status(500).json({ mensaje: 'Error al obtener las categorías' })
  }
}

module.exports = { obtenerSectores, obtenerEspecies, obtenerRazas, obtenerColores, obtenerCategorias }
