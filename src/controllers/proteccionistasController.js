const { pool } = require('../config/db')
const { registrarAuditoria } = require('../helpers/auditoria')

// ─── OBTENER PROTECCIONISTAS ──────────────────────────────────────────────────
const obtenerProteccionistas = async (_req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT
         p.PROTEC_ID,
         per.PERSON_CE,
         per.PERSON_NO,
         per.PERSON_AP,
         per.PERSON_TL,
         p.PRTEC_TS,
         p.PRTEC_TI,
         p.PRTEC_ON,
         p.PRTEC_RF,
         p.PRTEC_ES,
         p.PRTEC_CC,
         p.PRTEC_CA,
         p.PRTEC_CF,
         p.PRTEC_CX,
         p.PRTEC_IG,
         p.PRTEC_TK,
         p.PRTEC_FB,
         p.PRTEC_TW,
         p.PRTEC_ST
       FROM TM_PROTEC p
       INNER JOIN TM_PERSON per ON p.PERSON_ID = per.PERSON_ID
       ORDER BY p.PROTEC_ID DESC`
    )
    res.json({ total: resultado.rows.length, registros: resultado.rows })
  } catch (error) {
    console.error('Error en obtenerProteccionistas:', error.message)
    res.status(500).json({ mensaje: 'Error al obtener registros de proteccionistas' })
  }
}

// ─── REGISTRAR PROTECCIONISTA ─────────────────────────────────────────────────
const registrarProteccionista = async (req, res) => {
  const {
    PRTEC_NO, PERSON_CE, PERSON_TL,
    PRTEC_TS, PRTEC_TI, PRTEC_ON, PRTEC_RF,
    PRTEC_ES, PRTEC_CC,
    PRTEC_CA, PRTEC_CF, PRTEC_CX,
    PRTEC_IG, PRTEC_TK, PRTEC_FB, PRTEC_TW,
    PRTEC_ST,
  } = req.body

  if (!PRTEC_NO || !PERSON_CE) {
    return res.status(400).json({ mensaje: 'Nombre completo y cédula son obligatorios' })
  }

  const partes    = PRTEC_NO.trim().split(/\s+/)
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

    const protecInsert = await cliente.query(
      `INSERT INTO TM_PROTEC
         (PERSON_ID,
          PRTEC_TS, PRTEC_TI, PRTEC_ON, PRTEC_RF,
          PRTEC_ES, PRTEC_CC,
          PRTEC_CA, PRTEC_CF, PRTEC_CX,
          PRTEC_IG, PRTEC_TK, PRTEC_FB, PRTEC_TW,
          PRTEC_ST, PRTEC_FE)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,CURRENT_TIMESTAMP)
       RETURNING *`,
      [
        personaId,
        PRTEC_TS  || null,
        PRTEC_TI  || 'Independiente',
        PRTEC_ON  || null,
        PRTEC_RF  || null,
        PRTEC_ES  || null,
        PRTEC_CC  || null,
        parseInt(PRTEC_CA) || 0,
        parseInt(PRTEC_CF) || 0,
        parseInt(PRTEC_CX) || 0,
        PRTEC_IG  || null,
        PRTEC_TK  || null,
        PRTEC_FB  || null,
        PRTEC_TW  || null,
        PRTEC_ST  || 'Activo',
      ]
    )

    await registrarAuditoria(cliente, {
      modulo: 'PROTECCIONISTAS',
      accion: `Proteccionista registrado: ${PRTEC_NO} — Cédula: ${PERSON_CE}`,
      tipo: 'INFO',
      ip: req.ip,
    })

    await cliente.query('COMMIT')

    res.status(201).json({
      mensaje: 'Proteccionista registrado exitosamente',
      registro: { ...protecInsert.rows[0], person_ce: PERSON_CE, person_no: PERSON_NO, person_ap: PERSON_AP, person_tl: PERSON_TL },
    })
  } catch (error) {
    await cliente.query('ROLLBACK')
    console.error('Error en registrarProteccionista:', error.message)
    res.status(500).json({ mensaje: error.message || 'Error al registrar los datos del proteccionista' })
  } finally {
    cliente.release()
  }
}

module.exports = { obtenerProteccionistas, registrarProteccionista }
