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
         p.PERSON_EM,
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
    if (responderDatosInvalidos(res, error)) return
    res.status(500).json({ mensaje: 'Error al obtener registros de voluntarios' })
  }
}

// ─── REGISTRAR VOLUNTARIO ─────────────────────────────────────────────────────
const registrarVoluntario = async (req, res) => {
  const {
    VOLUN_NO,
    VOLUN_TS, VOLUN_OS, VOLUN_ES, VOLUN_CC,
    VOLUN_IG, VOLUN_TK, VOLUN_FB, VOLUN_TW,
    VOLUN_ST,
  } = req.body
  // El panel envía PERSON_CE/PERSON_TL; el formulario de la web, VOLUN_CI/VOLUN_TP.
  // Parroquia (VOLUN_PA) y dirección (VOLUN_DI) se guardan en TM_PERSON.
  const PERSON_CE = req.body.PERSON_CE ?? req.body.VOLUN_CI
  const PERSON_TL = req.body.PERSON_TL ?? req.body.VOLUN_TP
  const PERSON_PA = req.body.VOLUN_PA ?? null
  const PERSON_DI = req.body.VOLUN_DI ?? null
  const PERSON_EM = leerCorreo(req.body.PERSON_EM ?? req.body.VOLUN_EM)   // opcional

  if (!VOLUN_NO || !PERSON_CE) {
    return res.status(400).json({ mensaje: 'Nombre completo y cédula son obligatorios' })
  }
  if (PERSON_EM === false) {
    return res.status(400).json({ mensaje: 'El correo electrónico no tiene un formato válido' })
  }

  const partes    = String(VOLUN_NO).trim().split(/\s+/)
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
        // Desde el panel (con sesión) se respeta el estado elegido; desde la web
        // entra como Inactivo = "En espera" hasta que el administrador lo apruebe.
        req.usuario ? (VOLUN_ST || 'Activo') : 'Inactivo',
      ]
    )

    await registrarAuditoria(cliente, {
      modulo: 'VOLUNTARIOS',
      accion: `Voluntario registrado: ${VOLUN_NO} — Cédula: ${PERSON_CE}`,
      tipo: 'INFO',
      ip: req.ip,
    })

    const correoFinal = (await cliente.query('SELECT PERSON_EM FROM TM_PERSON WHERE PERSON_ID = $1', [personaId])).rows[0].person_em

    await cliente.query('COMMIT')

    // Registro hecho desde la web → aviso de "registro recibido" (si dejó correo)
    if (!req.usuario && correoFinal) {
      avisos.registroRecibido('voluntario', { email: correoFinal, nombre: VOLUN_NO.trim() })
    }

    res.status(201).json({
      mensaje: 'Voluntario registrado exitosamente',
      registro: { ...voluntInsert.rows[0], person_ce: PERSON_CE, person_no: PERSON_NO, person_ap: PERSON_AP, person_tl: PERSON_TL, person_em: correoFinal },
    })
  } catch (error) {
    await cliente.query('ROLLBACK')
    if (error.code === '23505') {
      return res.status(409).json({ mensaje: 'Esta cédula ya está registrada como voluntario. Puede consultar el estado de su registro en Seguimiento.' })
    }
    console.error('Error en registrarVoluntario:', error.message)
    if (responderDatosInvalidos(res, error)) return
    res.status(500).json({ mensaje: 'Error al registrar los datos del voluntario' })
  } finally {
    cliente.release()
  }
}

// ─── APROBAR / CAMBIAR ESTADO — PATCH /api/voluntarios/:id/estado ────────────
const actualizarEstadoVoluntario = async (req, res) => {
  const { id } = req.params
  const { VOLUN_ST } = req.body
  const { USUARI_ID, ROLREG_ID } = req.usuario

  if (Number(ROLREG_ID) !== 1) {
    return res.status(403).json({ mensaje: 'Solo el Administrador puede aprobar voluntarios' })
  }
  if (!['Activo', 'Inactivo'].includes(VOLUN_ST)) {
    return res.status(400).json({ mensaje: 'VOLUN_ST debe ser Activo o Inactivo' })
  }

  try {
    const anterior = (await pool.query('SELECT VOLUN_ST FROM TM_VOLUNT WHERE VOLUNT_ID = $1', [id])).rows[0]
    const resultado = await pool.query(
      `UPDATE TM_VOLUNT SET VOLUN_ST = $1 WHERE VOLUNT_ID = $2 RETURNING *`,
      [VOLUN_ST, id]
    )
    if (resultado.rows.length === 0) {
      return res.status(404).json({ mensaje: 'Voluntario no encontrado' })
    }

    // Aviso de aprobación (solo al pasar de Inactivo a Activo y si tiene correo)
    if (VOLUN_ST === 'Activo' && anterior?.volun_st !== 'Activo') {
      const p = (await pool.query(
        'SELECT PERSON_NO, PERSON_AP, PERSON_EM FROM TM_PERSON WHERE PERSON_ID = $1', [resultado.rows[0].person_id]
      )).rows[0]
      if (p?.person_em) avisos.registroAprobado('voluntario', { email: p.person_em, nombre: `${p.person_no} ${p.person_ap}`.trim() })
    }

    await registrarAuditoria(null, {
      usuari_id: USUARI_ID,
      modulo:    'VOLUNTARIOS',
      accion:    `Voluntario ${id} ${VOLUN_ST === 'Activo' ? 'aprobado' : 'marcado como inactivo'}`,
      tipo:      'INFO',
      ip:        req.ip,
    })

    res.json({ mensaje: 'Estado del voluntario actualizado', registro: resultado.rows[0] })
  } catch (error) {
    console.error('Error en actualizarEstadoVoluntario:', error.message)
    if (responderDatosInvalidos(res, error)) return
    res.status(500).json({ mensaje: 'Error al actualizar el estado del voluntario' })
  }
}

// ─── EDITAR VOLUNTARIO — PUT /api/voluntarios/:id ────────────────────────────
// Actualiza sus datos personales (TM_PERSON) y los del voluntariado (TM_VOLUNT).
const actualizarVoluntario = async (req, res) => {
  const { id } = req.params
  const b = req.body
  const nombre    = String(b.VOLUN_NO ?? '').trim()
  const PERSON_CE = String(b.PERSON_CE ?? b.VOLUN_CI ?? '').trim()
  const PERSON_TL = b.PERSON_TL ?? b.VOLUN_TP ?? null
  const PERSON_EM = leerCorreo(b.PERSON_EM ?? b.VOLUN_EM)

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
    const vol = await cliente.query(
      `UPDATE TM_VOLUNT
       SET    VOLUN_TS = $1, VOLUN_OS = $2, VOLUN_ES = $3, VOLUN_CC = $4,
              VOLUN_IG = $5, VOLUN_TK = $6, VOLUN_FB = $7, VOLUN_TW = $8,
              VOLUN_ST = COALESCE($9::estado_actividad, VOLUN_ST)
       WHERE  VOLUNT_ID = $10
       RETURNING *`,
      [b.VOLUN_TS || null, b.VOLUN_OS || null, b.VOLUN_ES || null, b.VOLUN_CC || null,
       b.VOLUN_IG || null, b.VOLUN_TK || null, b.VOLUN_FB || null, b.VOLUN_TW || null,
       b.VOLUN_ST || null, id]
    )
    if (vol.rows.length === 0) {
      await cliente.query('ROLLBACK')
      return res.status(404).json({ mensaje: 'Voluntario no encontrado' })
    }
    await cliente.query(
      `UPDATE TM_PERSON SET PERSON_CE = $1, PERSON_NO = $2, PERSON_AP = $3, PERSON_TL = $4, PERSON_EM = $5
       WHERE PERSON_ID = $6`,
      [PERSON_CE, partes[0], partes.slice(1).join(' ') || partes[0], PERSON_TL, PERSON_EM, vol.rows[0].person_id]
    )
    await registrarAuditoria(cliente, {
      usuari_id: req.usuario.USUARI_ID, modulo: 'VOLUNTARIOS',
      accion: `Voluntario actualizado: ${nombre} — Cédula: ${PERSON_CE}`, tipo: 'INFO', ip: req.ip,
    })
    await cliente.query('COMMIT')
    res.json({
      mensaje: 'Voluntario actualizado',
      registro: { ...vol.rows[0], person_ce: PERSON_CE, person_no: partes[0], person_ap: partes.slice(1).join(' ') || partes[0], person_tl: PERSON_TL, person_em: PERSON_EM },
    })
  } catch (error) {
    await cliente.query('ROLLBACK')
    if (error.code === '23505') return res.status(409).json({ mensaje: 'Esa cédula ya pertenece a otra persona registrada' })
    console.error('Error en actualizarVoluntario:', error.message)
    if (responderDatosInvalidos(res, error)) return
    res.status(500).json({ mensaje: 'Error al actualizar el voluntario' })
  } finally {
    cliente.release()
  }
}

// ─── ELIMINAR VOLUNTARIO — DELETE /api/voluntarios/:id ───────────────────────
// Borra el registro de voluntariado; la persona (TM_PERSON) se conserva.
const eliminarVoluntario = async (req, res) => {
  const { id } = req.params
  try {
    const r = await pool.query(
      `DELETE FROM TM_VOLUNT v USING TM_PERSON p
       WHERE v.VOLUNT_ID = $1 AND p.PERSON_ID = v.PERSON_ID
       RETURNING p.person_no, p.person_ap, p.person_ce`,
      [id]
    )
    if (r.rows.length === 0) return res.status(404).json({ mensaje: 'Voluntario no encontrado' })
    const v = r.rows[0]
    await registrarAuditoria(null, {
      usuari_id: req.usuario.USUARI_ID, modulo: 'VOLUNTARIOS',
      accion: `Voluntario eliminado: ${v.person_no} ${v.person_ap} — Cédula: ${v.person_ce}`, tipo: 'ALERTA', ip: req.ip,
    })
    res.json({ mensaje: 'Voluntario eliminado' })
  } catch (error) {
    console.error('Error en eliminarVoluntario:', error.message)
    if (responderDatosInvalidos(res, error)) return
    res.status(500).json({ mensaje: 'Error al eliminar el voluntario' })
  }
}

module.exports = { obtenerVoluntarios, registrarVoluntario, actualizarEstadoVoluntario, actualizarVoluntario, eliminarVoluntario }
