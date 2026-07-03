const { pool } = require('../config/db')
const { registrarAuditoria } = require('../helpers/auditoria')

// ─── OBTENER JORNADAS ─────────────────────────────────────────────────────────
const obtenerJornadas = async (_req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT j.jornad_id,
              j.sector_id,
              s.sector_no,
              j.jornad_no,
              j.jornad_fe,
              j.jornad_lu,
              j.jornad_de,
              j.jornad_es,
              j.jornad_vw,
              j.jornad_fre
       FROM   TT_JORNAD j
       LEFT JOIN TM_SECTOR s ON s.sector_id = j.sector_id
       ORDER  BY j.jornad_fe DESC`
    )
    res.json({
      total: resultado.rows.length,
      registros: resultado.rows,
    })
  } catch (error) {
    console.error('Error en obtenerJornadas:', error.message)
    res.status(500).json({ mensaje: 'Error al obtener los registros de jornadas' })
  }
}

// ─── CREAR JORNADA ────────────────────────────────────────────────────────────
const crearJornada = async (req, res) => {
  const { SECTOR_ID, JORNAD_NO, JORNAD_FE, JORNAD_LU, JORNAD_DE } = req.body
  const { USUARI_ID, ROLREG_ID } = req.usuario

  if (!SECTOR_ID || !JORNAD_NO || !JORNAD_FE) {
    return res.status(400).json({ mensaje: 'Sector, nombre y fecha son obligatorios' })
  }

  try {
    const resultado = await pool.query(
      `INSERT INTO TT_JORNAD
         (SECTOR_ID, JORNAD_NO, JORNAD_FE, JORNAD_LU, JORNAD_DE, JORNAD_ES, JORNAD_VW, USUARI_ID, JORNAD_FRE)
       VALUES ($1, $2, $3, $4, $5, 'PROGRAMADA', true, $6, CURRENT_TIMESTAMP)
       RETURNING *`,
      [SECTOR_ID, JORNAD_NO, JORNAD_FE, JORNAD_LU || null, JORNAD_DE || null, USUARI_ID]
    )

    await registrarAuditoria(pool, {
      usuari_id: USUARI_ID,
      rol: ROLREG_ID,
      modulo: 'JORNADAS',
      accion: `Jornada planificada: ${JORNAD_NO} — Sector ID ${SECTOR_ID} — Fecha: ${JORNAD_FE}`,
      tipo: 'INFO',
      ip: req.ip,
    })

    res.status(201).json({
      mensaje: 'Jornada planificada exitosamente',
      registro: resultado.rows[0],
    })
  } catch (error) {
    console.error('Error en crearJornada:', error.message)
    res.status(500).json({ mensaje: 'Error al registrar la jornada' })
  }
}

// ─── ELIMINAR JORNADA ─────────────────────────────────────────────────────────
const eliminarJornada = async (req, res) => {
  const { id } = req.params
  const { USUARI_ID, ROLREG_ID } = req.usuario

  try {
    const resultado = await pool.query(
      `DELETE FROM TT_JORNAD WHERE JORNAD_ID = $1 RETURNING jornad_no`,
      [id]
    )

    if (resultado.rows.length === 0) {
      return res.status(404).json({ mensaje: 'Jornada no encontrada' })
    }

    await registrarAuditoria(pool, {
      usuari_id: USUARI_ID,
      rol: ROLREG_ID,
      modulo: 'JORNADAS',
      accion: `Jornada eliminada: ${resultado.rows[0].jornad_no} (ID: ${id})`,
      tipo: 'ALERTA',
      ip: req.ip,
    })

    res.json({ mensaje: 'Jornada eliminada correctamente' })
  } catch (error) {
    console.error('Error en eliminarJornada:', error.message)
    res.status(500).json({ mensaje: 'Error al eliminar la jornada' })
  }
}

// ─── REGISTRAR OPERACIÓN DE JORNADA ───────────────────────────────────────────
const registrarOperacion = async (req, res) => {
  const { JORNAD_ID, CANT_ATEND, OBS_JOPER } = req.body
  const { USUARI_ID, ROLREG_ID } = req.usuario

  if (!JORNAD_ID || CANT_ATEND === undefined) {
    return res.status(400).json({ mensaje: 'Faltan datos obligatorios para el registro operativo' })
  }

  const cliente = await pool.connect()

  try {
    await cliente.query('BEGIN')

    const joperInsert = await cliente.query(
      `INSERT INTO TT_JOPER (JORNAD_ID, CANT_ATEND, OBS_JOPER, FEC_JOPER)
       VALUES ($1, $2, $3, CURRENT_DATE) RETURNING *`,
      [JORNAD_ID, CANT_ATEND, OBS_JOPER]
    )

    await registrarAuditoria(cliente, {
      usuari_id: USUARI_ID,
      rol: ROLREG_ID,
      modulo: 'JORNADAS_OPERATIVA',
      accion: `Registro operativo en jornada ${JORNAD_ID}. Atendidos: ${CANT_ATEND}`,
      tipo: 'INFO',
      ip: req.ip,
    })

    await cliente.query('COMMIT')

    res.status(201).json({
      mensaje: 'Registro operativo guardado exitosamente',
      registro: joperInsert.rows[0],
    })
  } catch (error) {
    await cliente.query('ROLLBACK')
    console.error('Error en registrarOperacion:', error.message)
    res.status(500).json({ mensaje: 'Error al guardar los datos operativos de la jornada' })
  } finally {
    cliente.release()
  }
}

module.exports = { obtenerJornadas, crearJornada, eliminarJornada, registrarOperacion }
