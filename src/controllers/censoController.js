const { pool } = require('../config/db')
const { registrarAuditoria } = require('../helpers/auditoria')

// ─── OBTENER CENSO COMPLETO ───────────────────────────────────────────────────
const obtenerCenso = async (_req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT
         c.CENSOA_ID,
         c.NOM_ANIMA,
         c.SEX_ANIMA,
         c.EDA_ANIMA,
         c.EST_REPRO,
         c.FEC_CENSO,
         p.PERSON_ID,
         p.PERSON_CE,
         p.PERSON_NO,
         p.PERSON_AP,
         p.PERSON_TL,
         p.PERSON_EM,
         c.SECTOR_ID,
         c.COLORE_ID,
         c.RAZARE_ID
       FROM TT_CENSOA c
       LEFT JOIN TM_PERSON p ON c.PERSON_ID = p.PERSON_ID
       ORDER BY c.FEC_CENSO DESC`
    )
    res.json({
      total:     resultado.rows.length,
      registros: resultado.rows,
    })
  } catch (error) {
    console.error('Error en obtenerCenso:', error.message)
    res.status(500).json({ mensaje: 'Error al obtener los registros del censo' })
  }
}

// ─── REGISTRAR PACIENTE EN EL CENSO ────────────────────────────────────────────
const registrarCenso = async (req, res) => {
  const {
    // Datos TM_PERSON
    PERSON_CE,
    PERSON_NO,
    PERSON_AP,
    PERSON_TL,
    PERSON_EM,
    // Datos TT_CENSOA
    SECTOR_ID,
    COLORE_ID,
    ESPECI_ID,
    RAZARE_ID,
    NOM_ANIMA,
    SEX_ANIMA,
    EDA_ANIMA,
    EST_REPRO,
    FEC_CENSO,
  } = req.body

  const { USUARI_ID, ROLREG_ID } = req.usuario || { USUARI_ID: 1, ROLREG_ID: 1 }

  console.log("== BACKEND SISCVI: Payload recibido en /api/censo ==", req.body);

  const cliente = await pool.connect()

  try {
    await cliente.query('BEGIN')

    let personaId

    // 1. Buscar propietario por cédula
    const busqueda = await cliente.query(
      'SELECT person_id FROM tm_person WHERE person_ce = $1',
      [PERSON_CE]
    )

    if (busqueda.rows.length > 0) {
      personaId = busqueda.rows[0].person_id
    } else {
      // Registrar nuevo propietario
      const personaInsert = await cliente.query(
        `INSERT INTO tm_person (person_ce, person_no, person_ap, person_tl, person_em)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING person_id`,
        [PERSON_CE, PERSON_NO, PERSON_AP, PERSON_TL, PERSON_EM]
      )
      personaId = personaInsert.rows[0].person_id
    }

    // 2. Insertar paciente en el censo
    const censoInsert = await cliente.query(
      `INSERT INTO tt_censoa
         (person_id, sector_id, colore_id, razare_id, especi_id,
          nom_anima, sex_anima, eda_anima, est_repro, fec_censo)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [personaId, SECTOR_ID, COLORE_ID, RAZARE_ID || null, ESPECI_ID || null, NOM_ANIMA, SEX_ANIMA, EDA_ANIMA, EST_REPRO, FEC_CENSO]
    )

    await cliente.query('COMMIT')

    // 3. Dejar rastro en auditoría
    await registrarAuditoria(pool, {
      usuari_id: USUARI_ID,
      rol: ROLREG_ID,
      modulo: 'CENSO_ANIMAL',
      accion: `Registro de censo (CENSOA_ID: ${censoInsert.rows[0].censoa_id}) vinculado a CI: ${PERSON_CE}`,
      tipo: 'INFO',
      ip: req.ip
    })

    res.status(201).json({
      mensaje: 'Paciente registrado exitosamente en el censo',
      registro: { ...censoInsert.rows[0], PERSON_CE, PERSON_NO, PERSON_AP }
    })
  } catch (error) {
    if (cliente) await cliente.query('ROLLBACK')
    console.error('== BACKEND SISCVI: ERROR SQL AL REGISTRAR CENSO ==')
    console.error('Detalles del Error:', error.message)
    console.error('Stack Trace:', error.stack)
    res.status(500).json({ 
      mensaje: 'Error al registrar paciente en el censo',
      error: error.message
    })
  } finally {
    cliente.release()
  }
}

module.exports = { obtenerCenso, registrarCenso }
