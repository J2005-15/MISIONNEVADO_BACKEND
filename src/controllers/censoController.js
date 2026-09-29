const { pool } = require('../config/db')
const { responderDatosInvalidos } = require('../helpers/erroresBD')
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
         c.RAZARE_ID,
         c.ESPECI_ID,
         s.SECTOR_NO,
         co.COLORE_NO,
         r.RAZARE_NO,
         e.ESPECI_NO
       FROM TT_CENSOA c
       LEFT JOIN TM_PERSON p  ON c.PERSON_ID = p.PERSON_ID
       LEFT JOIN TM_SECTOR s  ON c.SECTOR_ID = s.SECTOR_ID
       LEFT JOIN TM_COLORE co ON c.COLORE_ID = co.COLORE_ID
       LEFT JOIN TM_RAZARE r  ON c.RAZARE_ID = r.RAZARE_ID
       LEFT JOIN TM_ESPECI e  ON c.ESPECI_ID = e.ESPECI_ID
       ORDER BY c.FEC_CENSO DESC`
    )
    res.json({
      total:     resultado.rows.length,
      registros: resultado.rows,
    })
  } catch (error) {
    console.error('Error en obtenerCenso:', error.message)
    if (responderDatosInvalidos(res, error)) return
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
    if (responderDatosInvalidos(res, error)) return
    res.status(500).json({ 
      mensaje: 'Error al registrar paciente en el censo',
      error: error.message
    })
  } finally {
    cliente.release()
  }
}

// ─── EDITAR REGISTRO DEL CENSO — PUT /api/censo/:id ──────────────────────────
// Mismos campos que el registro. El propietario se identifica por cédula
// (comparando solo dígitos); si no existe se crea con los datos enviados.
const actualizarCenso = async (req, res) => {
  const { id } = req.params
  const b = req.body
  const PERSON_CE = String(b.PERSON_CE ?? '').trim()

  if (!PERSON_CE || !b.NOM_ANIMA || !b.SEX_ANIMA || !b.ESPECI_ID || !b.SECTOR_ID || !b.FEC_CENSO) {
    return res.status(400).json({ mensaje: 'Cédula del propietario, nombre, sexo, especie, sector y fecha son obligatorios' })
  }

  const cliente = await pool.connect()
  try {
    await cliente.query('BEGIN')

    const existente = await cliente.query(
      `SELECT person_id FROM TM_PERSON WHERE regexp_replace(person_ce, '\\D', '', 'g') = $1 LIMIT 1`,
      [PERSON_CE.replace(/\D/g, '')]
    )
    let personaId = existente.rows[0]?.person_id
    if (!personaId) {
      if (!b.PERSON_NO || !b.PERSON_AP) {
        await cliente.query('ROLLBACK')
        return res.status(400).json({ mensaje: 'No hay un propietario registrado con esa cédula' })
      }
      personaId = (await cliente.query(
        `INSERT INTO TM_PERSON (PERSON_CE, PERSON_NO, PERSON_AP, PERSON_TL, PERSON_EM)
         VALUES ($1, $2, $3, $4, $5) RETURNING person_id`,
        [PERSON_CE, b.PERSON_NO, b.PERSON_AP, b.PERSON_TL || null, b.PERSON_EM || null]
      )).rows[0].person_id
    }

    const r = await cliente.query(
      `UPDATE TT_CENSOA
       SET    PERSON_ID = $1, SECTOR_ID = $2, COLORE_ID = $3, RAZARE_ID = $4, ESPECI_ID = $5,
              NOM_ANIMA = $6, SEX_ANIMA = $7, EDA_ANIMA = $8, EST_REPRO = $9, FEC_CENSO = $10
       WHERE  CENSOA_ID = $11
       RETURNING *`,
      [personaId, b.SECTOR_ID, b.COLORE_ID || null, b.RAZARE_ID || null, b.ESPECI_ID,
       b.NOM_ANIMA, b.SEX_ANIMA, parseInt(b.EDA_ANIMA) || 0, b.EST_REPRO || null, b.FEC_CENSO, id]
    )
    if (r.rows.length === 0) {
      await cliente.query('ROLLBACK')
      return res.status(404).json({ mensaje: 'Registro de censo no encontrado' })
    }

    await registrarAuditoria(cliente, {
      usuari_id: req.usuario.USUARI_ID, rol: req.usuario.ROLREG_ID, modulo: 'CENSO_ANIMAL',
      accion: `Registro de censo actualizado (CENSOA_ID: ${id}) — ${b.NOM_ANIMA}, CI propietario: ${PERSON_CE}`,
      tipo: 'INFO', ip: req.ip,
    })
    await cliente.query('COMMIT')
    res.json({ mensaje: 'Registro del censo actualizado', registro: r.rows[0] })
  } catch (error) {
    await cliente.query('ROLLBACK')
    if (error.code === '22P02') return res.status(400).json({ mensaje: 'Algún dato no tiene un formato válido (sexo, fecha o edad)' })
    if (error.code === '23503') return res.status(400).json({ mensaje: 'Especie, raza, color o sector no válidos' })
    console.error('Error en actualizarCenso:', error.message)
    if (responderDatosInvalidos(res, error)) return
    res.status(500).json({ mensaje: 'Error al actualizar el registro del censo' })
  } finally {
    cliente.release()
  }
}

// ─── ELIMINAR REGISTRO DEL CENSO — DELETE /api/censo/:id ─────────────────────
// No se permite si el animal tiene consultas médicas o una adopción asociada,
// para no perder historial clínico ni el vínculo con su adoptante.
const eliminarCenso = async (req, res) => {
  const { id } = req.params
  try {
    const uso = (await pool.query(
      `SELECT (SELECT COUNT(1) FROM TT_CONSU  WHERE CENSOA_ID = $1)::int AS consultas,
              (SELECT COUNT(1) FROM TM_ADOPCI WHERE CENSOA_ID = $1)::int AS adopciones`,
      [id]
    )).rows[0]
    if (uso.consultas > 0 || uso.adopciones > 0) {
      const motivo = uso.consultas > 0 ? `tiene ${uso.consultas} consulta(s) médica(s) registrada(s)` : 'está vinculado a una adopción'
      return res.status(409).json({ mensaje: `No se puede eliminar: el animal ${motivo}.` })
    }

    const r = await pool.query('DELETE FROM TT_CENSOA WHERE CENSOA_ID = $1 RETURNING nom_anima', [id])
    if (r.rows.length === 0) return res.status(404).json({ mensaje: 'Registro de censo no encontrado' })

    await registrarAuditoria(null, {
      usuari_id: req.usuario.USUARI_ID, rol: req.usuario.ROLREG_ID, modulo: 'CENSO_ANIMAL',
      accion: `Registro de censo eliminado (CENSOA_ID: ${id}) — ${r.rows[0].nom_anima}`, tipo: 'ALERTA', ip: req.ip,
    })
    res.json({ mensaje: 'Registro del censo eliminado' })
  } catch (error) {
    console.error('Error en eliminarCenso:', error.message)
    if (responderDatosInvalidos(res, error)) return
    res.status(500).json({ mensaje: 'Error al eliminar el registro del censo' })
  }
}

module.exports = { obtenerCenso, registrarCenso, actualizarCenso, eliminarCenso }
