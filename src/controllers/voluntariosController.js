const { pool } = require('../config/db')
const { registrarAuditoria } = require('../helpers/auditoria')

// ─── OBTENER VOLUNTARIOS ──────────────────────────────────────────────────────
const obtenerVoluntarios = async (_req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT
         v.VOLUNT_ID,
         p.PERSON_CE,
         p.PERSON_NO,
         p.PERSON_AP,
         p.PERSON_TL,
         v.VOLUN_TS,
         v.VOLUN_OS,
         v.VOLUN_ES,
         v.VOLUN_CC,
         v.VOLUN_IG,
         v.VOLUN_TK,
         v.VOLUN_FB,
         v.VOLUN_TW,
         v.VOLUN_ST
       FROM TM_VOLUNT v
       INNER JOIN TM_PERSON p ON v.PERSON_ID = p.PERSON_ID
       ORDER BY v.VOLUNT_ID DESC`
    )
    res.json({ total: resultado.rows.length, registros: resultado.rows })
  } catch (error) {
    console.error('Error en obtenerVoluntarios:', error.message)
    res.status(500).json({ mensaje: 'Error al obtener registros de voluntarios' })
  }
}

// ─── REGISTRAR VOLUNTARIO ─────────────────────────────────────────────────────
const registrarVoluntario = async (req, res) => {
  const {
    VOLUN_NO, PERSON_CE, PERSON_TL,
    VOLUN_TS, VOLUN_OS, VOLUN_ES, VOLUN_CC,
    VOLUN_IG, VOLUN_TK, VOLUN_FB, VOLUN_TW,
    VOLUN_ST,
  } = req.body

  if (!VOLUN_NO || !PERSON_CE) {
    return res.status(400).json({ mensaje: 'Nombre completo y cédula son obligatorios' })
  }

  const partes    = VOLUN_NO.trim().split(/\s+/)
  const PERSON_NO = partes[0]
  const PERSON_AP = partes.slice(1).join(' ') || partes[0]

  const cliente = await pool.connect()
  try {
    await cliente.query('BEGIN')

    let personaId
    const busqueda = await cliente.query(
      `SELECT PERSON_ID FROM TM_PERSON WHERE PERSON_CE = $1`, [PERSON_CE]
    )
    if (busqueda.rows.length > 0) {
      personaId = busqueda.rows[0].person_id
    } else {
      const ins = await cliente.query(
        `INSERT INTO TM_PERSON (PERSON_CE, PERSON_NO, PERSON_AP, PERSON_TL)
         VALUES ($1, $2, $3, $4) RETURNING PERSON_ID`,
        [PERSON_CE, PERSON_NO, PERSON_AP, PERSON_TL || null]
      )
      personaId = ins.rows[0].person_id
    }

    const voluntInsert = await cliente.query(
      `INSERT INTO TM_VOLUNT
         (PERSON_ID,
          VOLUN_TS, VOLUN_OS, VOLUN_ES, VOLUN_CC,
          VOLUN_IG, VOLUN_TK, VOLUN_FB, VOLUN_TW,
          VOLUN_ST, VOLUN_FE)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,CURRENT_TIMESTAMP)
       RETURNING *`,
      [
        personaId,
        VOLUN_TS || null,
        VOLUN_OS || null,
        VOLUN_ES || null,
        VOLUN_CC || null,
        VOLUN_IG || null,
        VOLUN_TK || null,
        VOLUN_FB || null,
        VOLUN_TW || null,
        VOLUN_ST || 'Activo',
      ]
    )

    await registrarAuditoria(cliente, {
      modulo: 'VOLUNTARIOS',
      accion: `Voluntario registrado: ${VOLUN_NO} — Cédula: ${PERSON_CE}`,
      tipo: 'INFO',
      ip: req.ip,
    })

    await cliente.query('COMMIT')

    res.status(201).json({
      mensaje: 'Voluntario registrado exitosamente',
      registro: { ...voluntInsert.rows[0], person_ce: PERSON_CE, person_no: PERSON_NO, person_ap: PERSON_AP, person_tl: PERSON_TL },
    })
  } catch (error) {
    await cliente.query('ROLLBACK')
    console.error('Error en registrarVoluntario:', error.message)
    res.status(500).json({ mensaje: error.message || 'Error al registrar los datos del voluntario' })
  } finally {
    cliente.release()
  }
}

module.exports = { obtenerVoluntarios, registrarVoluntario }
