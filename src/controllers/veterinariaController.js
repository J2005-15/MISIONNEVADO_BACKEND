const { pool } = require('../config/db')
const { registrarAuditoria } = require('../helpers/auditoria')

// ─── OBTENER TODAS LAS CONSULTAS ──────────────────────────────────────────────
const obtenerConsultas = async (_req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT
         c.CONSUL_ID,
         c.CENSOA_ID,
         ca.NOM_ANIMA,
         p.PERSON_CE,
         CONCAT(p.PERSON_NO, ' ', p.PERSON_AP) AS PROPIET_NO,
         c.USUARI_ID,
         u.USUARI_NO,
         c.JORNAD_ID,
         j.JORNAD_NO,
         c.CONSUL_FE,
         c.CONSUL_PK,
         c.CONSUL_TE,
         c.CONSUL_FC,
         c.CONSUL_FR,
         c.CONSUL_MO,
         c.CONSUL_DI,
         c.CONSUL_TR,
         c.CONSUL_OB,
         c.CONSUL_PR,
         c.CONSUL_ES
       FROM TT_CONSU c
       INNER JOIN TT_CENSOA ca ON c.CENSOA_ID = ca.CENSOA_ID
       INNER JOIN TM_PERSON  p  ON ca.PERSON_ID = p.PERSON_ID
       LEFT  JOIN TM_USUARIO u  ON c.USUARI_ID  = u.USUARI_ID
       LEFT  JOIN TT_JORNAD  j  ON c.JORNAD_ID  = j.JORNAD_ID
       ORDER BY c.CONSUL_ID DESC`
    )
    res.json({ total: resultado.rows.length, registros: resultado.rows })
  } catch (error) {
    console.error('Error en obtenerConsultas:', error.message)
    res.status(500).json({ mensaje: 'Error al obtener el historial de consultas' })
  }
}

// ─── REGISTRAR CONSULTA MÉDICA ────────────────────────────────────────────────
const registrarConsulta = async (req, res) => {
  const { USUARI_ID } = req.usuario  // viene del JWT — no se recibe en el body

  const {
    CENSOA_ID,
    JORNAD_ID  = null,
    CONSUL_FE,
    CONSUL_PK  = null,
    CONSUL_TE  = null,
    CONSUL_FC  = null,
    CONSUL_FR  = null,
    CONSUL_MO  = null,
    CONSUL_DI  = null,
    CONSUL_TR  = null,
    CONSUL_OB  = null,
    CONSUL_PR  = null,
    CONSUL_ES  = 'Pendiente',
  } = req.body

  if (!CENSOA_ID || !CONSUL_FE) {
    return res.status(400).json({ mensaje: 'El paciente (CENSOA_ID) y la fecha son obligatorios' })
  }

  const cliente = await pool.connect()
  try {
    await cliente.query('BEGIN')

    const insercion = await cliente.query(
      `INSERT INTO TT_CONSU
         (CENSOA_ID, USUARI_ID, JORNAD_ID,
          CONSUL_FE, CONSUL_PK, CONSUL_TE, CONSUL_FC, CONSUL_FR,
          CONSUL_MO, CONSUL_DI, CONSUL_TR, CONSUL_OB, CONSUL_PR, CONSUL_ES)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING CONSUL_ID`,
      [
        parseInt(CENSOA_ID),
        USUARI_ID,
        JORNAD_ID  ? parseInt(JORNAD_ID) : null,
        CONSUL_FE,
        CONSUL_PK  || null,
        CONSUL_TE  || null,
        CONSUL_FC  || null,
        CONSUL_FR  || null,
        CONSUL_MO  || null,
        CONSUL_DI  || null,
        CONSUL_TR  || null,
        CONSUL_OB  || null,
        CONSUL_PR  || null,
        CONSUL_ES,
      ]
    )

    await registrarAuditoria(cliente, {
      modulo: 'VETERINARIA',
      accion: `Consulta médica registrada — CENSOA_ID: ${CENSOA_ID} — Motivo: ${CONSUL_MO || '—'}`,
      tipo: 'INFO',
      ip: req.ip,
    })

    await cliente.query('COMMIT')

    // Retornar el registro completo con los JOINs
    const completo = await pool.query(
      `SELECT
         c.CONSUL_ID, c.CENSOA_ID, ca.NOM_ANIMA,
         p.PERSON_CE, CONCAT(p.PERSON_NO, ' ', p.PERSON_AP) AS PROPIET_NO,
         c.USUARI_ID, u.USUARI_NO,
         c.JORNAD_ID, j.JORNAD_NO,
         c.CONSUL_FE, c.CONSUL_PK, c.CONSUL_TE, c.CONSUL_FC, c.CONSUL_FR,
         c.CONSUL_MO, c.CONSUL_DI, c.CONSUL_TR, c.CONSUL_OB, c.CONSUL_PR, c.CONSUL_ES
       FROM TT_CONSU c
       INNER JOIN TT_CENSOA ca ON c.CENSOA_ID = ca.CENSOA_ID
       INNER JOIN TM_PERSON  p  ON ca.PERSON_ID = p.PERSON_ID
       LEFT  JOIN TM_USUARIO u  ON c.USUARI_ID  = u.USUARI_ID
       LEFT  JOIN TT_JORNAD  j  ON c.JORNAD_ID  = j.JORNAD_ID
       WHERE c.CONSUL_ID = $1`,
      [insercion.rows[0].consul_id]
    )

    res.status(201).json({
      mensaje: 'Consulta médica registrada exitosamente',
      registro: completo.rows[0],
    })
  } catch (error) {
    await cliente.query('ROLLBACK')
    console.error('Error en registrarConsulta:', error.message)
    res.status(500).json({ mensaje: error.message || 'Error al registrar la consulta médica' })
  } finally {
    cliente.release()
  }
}

// ─── HISTORIAL POR PACIENTE ───────────────────────────────────────────────────
const obtenerHistorial = async (req, res) => {
  const { id_censoa } = req.params
  try {
    const resultado = await pool.query(
      `SELECT
         c.CONSUL_ID, c.CONSUL_FE, c.CONSUL_PK, c.CONSUL_TE,
         c.CONSUL_FC, c.CONSUL_FR, c.CONSUL_MO, c.CONSUL_DI,
         c.CONSUL_TR, c.CONSUL_OB, c.CONSUL_PR, c.CONSUL_ES,
         u.USUARI_NO AS veterinario
       FROM TT_CONSU c
       LEFT JOIN TM_USUARIO u ON c.USUARI_ID = u.USUARI_ID
       WHERE c.CENSOA_ID = $1
       ORDER BY c.CONSUL_FE DESC`,
      [id_censoa]
    )
    res.json({ paciente: Number(id_censoa), total: resultado.rows.length, registros: resultado.rows })
  } catch (error) {
    console.error('Error en obtenerHistorial:', error.message)
    res.status(500).json({ mensaje: 'Error al obtener los registros clínicos' })
  }
}

module.exports = { obtenerConsultas, registrarConsulta, obtenerHistorial }
