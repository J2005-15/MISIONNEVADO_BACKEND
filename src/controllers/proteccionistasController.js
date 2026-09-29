const { pool } = require('../config/db')
const { responderDatosInvalidos } = require('../helpers/erroresBD')
const { registrarAuditoria } = require('../helpers/auditoria')
const avisos = require('../helpers/avisos')

// Correo opcional: vacío → null; con formato inválido → false
const leerCorreo = (valor) => {
  const correo = String(valor ?? '').trim()
  if (!correo) return null
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo) ? correo : false
}

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
         per.PERSON_EM,
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
    if (responderDatosInvalidos(res, error)) return
    res.status(500).json({ mensaje: 'Error al obtener registros de proteccionistas' })
  }
}

// ─── REGISTRAR PROTECCIONISTA ─────────────────────────────────────────────────
const registrarProteccionista = async (req, res) => {
  // El panel envía PERSON_CE/PERSON_TL; el formulario de la web, PRTEC_CI/PRTEC_TP.
  // Parroquia (PRTEC_PA) y dirección (PRTEC_DI) se guardan en TM_PERSON.
  const PERSON_CE = req.body.PERSON_CE ?? req.body.PRTEC_CI
  const PERSON_TL = req.body.PERSON_TL ?? req.body.PRTEC_TP
  const PERSON_PA = req.body.PRTEC_PA ?? null
  const PERSON_DI = req.body.PRTEC_DI ?? null
  const PERSON_EM = leerCorreo(req.body.PERSON_EM ?? req.body.PRTEC_EM)   // opcional
  const {
    PRTEC_NO,
    PRTEC_TS, PRTEC_TI, PRTEC_ON, PRTEC_RF,
    PRTEC_ES, PRTEC_CC,
    PRTEC_CA, PRTEC_CF, PRTEC_CX,
    PRTEC_IG, PRTEC_TK, PRTEC_FB, PRTEC_TW,
    PRTEC_ST,
  } = req.body

  if (!PRTEC_NO || !PERSON_CE) {
    return res.status(400).json({ mensaje: 'Nombre completo y cédula son obligatorios' })
  }
  if (PERSON_EM === false) {
    return res.status(400).json({ mensaje: 'El correo electrónico no tiene un formato válido' })
  }

  const partes    = String(PRTEC_NO).trim().split(/\s+/)
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
      // La persona ya existía (p. ej. por una denuncia): completa lo que falte y
      // reemplaza el nombre "Anónimo", sin pisar datos que ya estaban cargados.
      await cliente.query(
        `UPDATE TM_PERSON SET
           PERSON_NO = CASE WHEN PERSON_NO = 'Anónimo' THEN $2 ELSE PERSON_NO END,
           PERSON_AP = CASE WHEN PERSON_AP = 'Anónimo' THEN $3 ELSE PERSON_AP END,
           PERSON_TL = COALESCE(NULLIF(PERSON_TL, ''), $4),
           PERSON_PA = COALESCE(NULLIF(PERSON_PA, ''), $5),
           PERSON_DI = COALESCE(NULLIF(PERSON_DI, ''), $6),
           PERSON_EM = COALESCE($7, PERSON_EM)
         WHERE PERSON_ID = $1`,
        [personaId, PERSON_NO, PERSON_AP, PERSON_TL || null, PERSON_PA, PERSON_DI, PERSON_EM || null]
      )
    } else {
      const ins = await cliente.query(
        `INSERT INTO TM_PERSON (PERSON_CE, PERSON_NO, PERSON_AP, PERSON_TL, PERSON_PA, PERSON_DI, PERSON_EM)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING PERSON_ID`,
        [PERSON_CE, PERSON_NO, PERSON_AP, PERSON_TL || null, PERSON_PA, PERSON_DI, PERSON_EM]
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
        // Desde el panel (con sesión) se respeta el estado elegido; desde la web
        // entra como Inactivo = "En espera" hasta que el administrador lo apruebe.
        req.usuario ? (PRTEC_ST || 'Activo') : 'Inactivo',
      ]
    )

    await registrarAuditoria(cliente, {
      modulo: 'PROTECCIONISTAS',
      accion: `Proteccionista registrado: ${PRTEC_NO} — Cédula: ${PERSON_CE}`,
      tipo: 'INFO',
      ip: req.ip,
    })

    const correoFinal = (await cliente.query('SELECT PERSON_EM FROM TM_PERSON WHERE PERSON_ID = $1', [personaId])).rows[0].person_em

    await cliente.query('COMMIT')

    // Registro hecho desde la web → aviso de "registro recibido" (si dejó correo)
    if (!req.usuario && correoFinal) {
      avisos.registroRecibido('proteccionista', { email: correoFinal, nombre: PRTEC_NO.trim() })
    }

    res.status(201).json({
      mensaje: 'Proteccionista registrado exitosamente',
      registro: { ...protecInsert.rows[0], person_ce: PERSON_CE, person_no: PERSON_NO, person_ap: PERSON_AP, person_tl: PERSON_TL, person_em: correoFinal },
    })
  } catch (error) {
    await cliente.query('ROLLBACK')
    if (error.code === '23505') {
      return res.status(409).json({ mensaje: 'Esta cédula ya está registrada como proteccionista. Puede consultar el estado de su registro en Seguimiento.' })
    }
    console.error('Error en registrarProteccionista:', error.message)
    if (responderDatosInvalidos(res, error)) return
    res.status(500).json({ mensaje: 'Error al registrar los datos del proteccionista' })
  } finally {
    cliente.release()
  }
}

// ─── APROBAR / CAMBIAR ESTADO — PATCH /api/proteccionistas/:id/estado ────────
const actualizarEstadoProteccionista = async (req, res) => {
  const { id } = req.params
  const { PRTEC_ST } = req.body
  const { USUARI_ID, ROLREG_ID } = req.usuario

  if (Number(ROLREG_ID) !== 1) {
    return res.status(403).json({ mensaje: 'Solo el Administrador puede aprobar proteccionistas' })
  }
  if (!['Activo', 'Inactivo'].includes(PRTEC_ST)) {
    return res.status(400).json({ mensaje: 'PRTEC_ST debe ser Activo o Inactivo' })
  }

  try {
    const anterior = (await pool.query('SELECT PRTEC_ST FROM TM_PROTEC WHERE PROTEC_ID = $1', [id])).rows[0]
    const resultado = await pool.query(
      `UPDATE TM_PROTEC SET PRTEC_ST = $1 WHERE PROTEC_ID = $2 RETURNING *`,
      [PRTEC_ST, id]
    )
    if (resultado.rows.length === 0) {
      return res.status(404).json({ mensaje: 'Proteccionista no encontrado' })
    }

    // Aviso de aprobación (solo al pasar de Inactivo a Activo y si tiene correo)
    if (PRTEC_ST === 'Activo' && anterior?.prtec_st !== 'Activo') {
      const p = (await pool.query(
        'SELECT PERSON_NO, PERSON_AP, PERSON_EM FROM TM_PERSON WHERE PERSON_ID = $1', [resultado.rows[0].person_id]
      )).rows[0]
      if (p?.person_em) avisos.registroAprobado('proteccionista', { email: p.person_em, nombre: `${p.person_no} ${p.person_ap}`.trim() })
    }

    await registrarAuditoria(null, {
      usuari_id: USUARI_ID,
      modulo:    'PROTECCIONISTAS',
      accion:    `Proteccionista ${id} ${PRTEC_ST === 'Activo' ? 'aprobado' : 'marcado como inactivo'}`,
      tipo:      'INFO',
      ip:        req.ip,
    })

    res.json({ mensaje: 'Estado del proteccionista actualizado', registro: resultado.rows[0] })
  } catch (error) {
    console.error('Error en actualizarEstadoProteccionista:', error.message)
    if (responderDatosInvalidos(res, error)) return
    res.status(500).json({ mensaje: 'Error al actualizar el estado del proteccionista' })
  }
}

// ─── EDITAR PROTECCIONISTA — PUT /api/proteccionistas/:id ────────────────────
const actualizarProteccionista = async (req, res) => {
  const { id } = req.params
  const b = req.body
  const nombre    = String(b.PRTEC_NO ?? '').trim()
  const PERSON_CE = String(b.PERSON_CE ?? b.PRTEC_CI ?? '').trim()
  const PERSON_TL = b.PERSON_TL ?? b.PRTEC_TP ?? null
  const PERSON_EM = leerCorreo(b.PERSON_EM ?? b.PRTEC_EM)

  if (!nombre || !PERSON_CE) {
    return res.status(400).json({ mensaje: 'Nombre completo y cédula son obligatorios' })
  }
  if (PERSON_EM === false) {
    return res.status(400).json({ mensaje: 'El correo electrónico no tiene un formato válido' })
  }
  const partes = nombre.split(/\s+/)

  const cliente = await pool.connect()
  try {
    await cliente.query('BEGIN')
    const pro = await cliente.query(
      `UPDATE TM_PROTEC
       SET    PRTEC_TS = $1, PRTEC_TI = COALESCE($2::tipo_protec, PRTEC_TI), PRTEC_ON = $3, PRTEC_RF = $4,
              PRTEC_ES = $5, PRTEC_CC = $6, PRTEC_CA = $7, PRTEC_CF = $8, PRTEC_CX = $9,
              PRTEC_IG = $10, PRTEC_TK = $11, PRTEC_FB = $12, PRTEC_TW = $13,
              PRTEC_ST = COALESCE($14::estado_actividad, PRTEC_ST)
       WHERE  PROTEC_ID = $15
       RETURNING *`,
      [b.PRTEC_TS || null, b.PRTEC_TI || null, b.PRTEC_ON || null, b.PRTEC_RF || null,
       b.PRTEC_ES || null, b.PRTEC_CC || null,
       parseInt(b.PRTEC_CA) || 0, parseInt(b.PRTEC_CF) || 0, parseInt(b.PRTEC_CX) || 0,
       b.PRTEC_IG || null, b.PRTEC_TK || null, b.PRTEC_FB || null, b.PRTEC_TW || null,
       b.PRTEC_ST || null, id]
    )
    if (pro.rows.length === 0) {
      await cliente.query('ROLLBACK')
      return res.status(404).json({ mensaje: 'Proteccionista no encontrado' })
    }
    await cliente.query(
      `UPDATE TM_PERSON SET PERSON_CE = $1, PERSON_NO = $2, PERSON_AP = $3, PERSON_TL = $4, PERSON_EM = $5
       WHERE PERSON_ID = $6`,
      [PERSON_CE, partes[0], partes.slice(1).join(' ') || partes[0], PERSON_TL, PERSON_EM, pro.rows[0].person_id]
    )
    await registrarAuditoria(cliente, {
      usuari_id: req.usuario.USUARI_ID, modulo: 'PROTECCIONISTAS',
      accion: `Proteccionista actualizado: ${nombre} — Cédula: ${PERSON_CE}`, tipo: 'INFO', ip: req.ip,
    })
    await cliente.query('COMMIT')
    res.json({
      mensaje: 'Proteccionista actualizado',
      registro: { ...pro.rows[0], person_ce: PERSON_CE, person_no: partes[0], person_ap: partes.slice(1).join(' ') || partes[0], person_tl: PERSON_TL, person_em: PERSON_EM },
    })
  } catch (error) {
    await cliente.query('ROLLBACK')
    if (error.code === '23505') return res.status(409).json({ mensaje: 'Esa cédula ya pertenece a otra persona registrada' })
    if (error.code === '22P02') return res.status(400).json({ mensaje: 'Tipo u estado no válido' })
    console.error('Error en actualizarProteccionista:', error.message)
    if (responderDatosInvalidos(res, error)) return
    res.status(500).json({ mensaje: 'Error al actualizar el proteccionista' })
  } finally {
    cliente.release()
  }
}

// ─── ELIMINAR PROTECCIONISTA — DELETE /api/proteccionistas/:id ───────────────
// Borra el registro de proteccionista; la persona (TM_PERSON) se conserva.
const eliminarProteccionista = async (req, res) => {
  const { id } = req.params
  try {
    const r = await pool.query(
      `DELETE FROM TM_PROTEC x USING TM_PERSON p
       WHERE x.PROTEC_ID = $1 AND p.PERSON_ID = x.PERSON_ID
       RETURNING p.person_no, p.person_ap, p.person_ce`,
      [id]
    )
    if (r.rows.length === 0) return res.status(404).json({ mensaje: 'Proteccionista no encontrado' })
    const p = r.rows[0]
    await registrarAuditoria(null, {
      usuari_id: req.usuario.USUARI_ID, modulo: 'PROTECCIONISTAS',
      accion: `Proteccionista eliminado: ${p.person_no} ${p.person_ap} — Cédula: ${p.person_ce}`, tipo: 'ALERTA', ip: req.ip,
    })
    res.json({ mensaje: 'Proteccionista eliminado' })
  } catch (error) {
    console.error('Error en eliminarProteccionista:', error.message)
    if (responderDatosInvalidos(res, error)) return
    res.status(500).json({ mensaje: 'Error al eliminar el proteccionista' })
  }
}

module.exports = { obtenerProteccionistas, registrarProteccionista, actualizarEstadoProteccionista, actualizarProteccionista, eliminarProteccionista }
