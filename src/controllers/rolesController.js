const { pool } = require('../config/db')

// ─── OBTENER CATÁLOGO DE ROLES ────────────────────────────────────────────────
const obtenerRoles = async (_req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT ROLREG_ID, ROLREG_NO, ROLREG_DE
       FROM   TM_ROLREG
       ORDER  BY ROLREG_ID ASC`
    )
    res.json({
      total:     resultado.rows.length,
      registros: resultado.rows,
    })
  } catch (error) {
    console.error('Error en obtenerRoles:', error.message)
    res.status(500).json({ mensaje: 'Error al obtener los roles del sistema' })
  }
}

// ─── ASIGNAR ROL A UN USUARIO ─────────────────────────────────────────────────
const asignarRol = async (req, res) => {
  const { USUARI_ID, ROLREG_ID } = req.body

  if (!USUARI_ID || !ROLREG_ID) {
    return res.status(400).json({ mensaje: 'USUARI_ID y ROLREG_ID son obligatorios' })
  }

  try {
    const resultado = await pool.query(
      `UPDATE TM_USUARIO
       SET    ROLREG_ID = $1
       WHERE  USUARI_ID = $2
       RETURNING USUARI_ID, USUARI_NO, ROLREG_ID, USUARI_ES`,
      [ROLREG_ID, USUARI_ID]
    )

    if (resultado.rows.length === 0) {
      return res.status(404).json({ mensaje: 'Usuario no encontrado' })
    }

    res.json({
      mensaje:  'Rol asignado exitosamente',
      registro: resultado.rows[0],
    })
  } catch (error) {
    console.error('Error en asignarRol:', error.message)
    res.status(500).json({ mensaje: 'Error al asignar el rol al usuario' })
  }
}

module.exports = { obtenerRoles, asignarRol }
