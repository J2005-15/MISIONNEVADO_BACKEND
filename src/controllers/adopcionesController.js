const { pool } = require('../config/db')
const { responderDatosInvalidos } = require('../helpers/erroresBD')
const { registrarAuditoria } = require('../helpers/auditoria')
const { subirImagen } = require('../helpers/subirImagen')
const avisos = require('../helpers/avisos')

// Especie por nombre → ESPECI_ID; raza por nombre → RAZARE_ID. Si la raza no
// existe en el catálogo de esa especie se agrega, para que no se pierda el dato.
const resolverCatalogo = async (db, especie, raza) => {
  let especiId = null
  if (especie) {
    const r = await db.query(
      `SELECT especi_id FROM TM_ESPECI WHERE LOWER(especi_no) = LOWER($1) LIMIT 1`, [especie]
    )
    if (r.rows.length > 0) especiId = r.rows[0].especi_id
  }

  let razaId = null
  if (raza && raza.trim() && especiId) {
    const r = await db.query(
      `SELECT razare_id FROM TM_RAZARE WHERE LOWER(razare_no) = LOWER($1) AND especi_id = $2 LIMIT 1`,
      [raza.trim(), especiId]
    )
    razaId = r.rows.length > 0
      ? r.rows[0].razare_id
      : (await db.query(
          `INSERT INTO TM_RAZARE (ESPECI_ID, RAZARE_NO) VALUES ($1, $2) RETURNING razare_id`,
          [especiId, raza.trim()]
        )).rows[0].razare_id
  }
  return { especiId, razaId }
}

// Paciente con los nombres de especie y raza (forma que devuelve el catálogo)
const obtenerPacienteCompleto = async (db, id) =>
  (await db.query(
    `SELECT a.*, e.especi_no AS adopci_es, r.razare_no AS adopci_ra
     FROM   TM_ADOPCI a
     LEFT JOIN TM_ESPECI e ON e.especi_id = a.especi_id
     LEFT JOIN TM_RAZARE r ON r.razare_id = a.razare_id
     WHERE  a.adopci_id = $1`,
    [id]
  )).rows[0]

const subirFoto = (buffer) => subirImagen(buffer, 'sisvic/adopciones')

// Claves en mayúscula (ADOPCI_NO…): formato que lee directamente la web pública
const aMayusculas = (fila) =>
  Object.fromEntries(Object.entries(fila).map(([clave, valor]) => [clave.toUpperCase(), valor]))

// Solo se entregan fotos con URL completa (Cloudinary); nombres sueltos como
// 'estrella.jpg' (datos de prueba) no existen y se tratan como "sin foto".
const conFotoValida = (fila) => ({
  ...fila,
  adopci_ft: /^https?:\/\//.test(fila.adopci_ft ?? '') ? fila.adopci_ft : null,
})

// ─── OBTENER CARTELERA DE ADOPCIONES ──────────────────────────────────────────
// Sin parámetros: catálogo completo para el panel (incluye adoptados y ADOPCI_VW).
// ?visibles=1: solo lo publicado en la web (ADOPCI_VW) y aún no adoptado.
const obtenerCatalogo = async (req, res) => {
  const soloVisibles = Boolean(req.query.visibles)

  try {
    const resultado = await pool.query(
      `SELECT a.*,
              e.especi_no AS adopci_es,
              r.razare_no AS adopci_ra
       FROM   TM_ADOPCI a
       LEFT JOIN TM_ESPECI e ON e.especi_id = a.especi_id
       LEFT JOIN TM_RAZARE r ON r.razare_id = a.razare_id
       ${soloVisibles ? `WHERE a.adopci_vw = true AND a.adopci_st <> 'ADOPTADO'` : ''}
       ORDER BY a.adopci_id ASC`
    )

    const filas = resultado.rows.map(conFotoValida)

    if (soloVisibles) {
      const pacientes = filas.map(aMayusculas)
      return res.json({ total: pacientes.length, pacientes, registros: pacientes })
    }

    res.json({
      total:     filas.length,
      registros: filas,
    })
  } catch (error) {
    console.error('Error en obtenerCatalogo:', error.message)
    if (responderDatosInvalidos(res, error)) return
    res.status(500).json({ mensaje: 'Error al obtener los datos de la cartelera' })
  }
}

// ─── LISTAR SOLICITUDES (ADMIN) ───────────────────────────────────────────────
const obtenerSolicitudes = async (_req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT s.solic_id,
              s.adopci_id,
              a.adopci_no AS mascota_no,
              s.sol_ce    AS solic_ce,
              s.sol_no    AS solic_no,
              s.sol_em    AS solic_em,
              s.sol_tl    AS solic_tl,
              s.sol_me    AS solic_mo,
              s.sol_es    AS solic_es,
              s.sol_fe    AS solic_fe
       FROM TT_SOLIC s
       LEFT JOIN TM_ADOPCI a ON a.adopci_id = s.adopci_id
       ORDER BY s.solic_id DESC`
    )
    res.json({ total: resultado.rows.length, registros: resultado.rows })
  } catch (error) {
    console.error('Error en obtenerSolicitudes:', error.message)
    if (responderDatosInvalidos(res, error)) return
    res.status(500).json({ mensaje: 'Error al obtener las solicitudes de adopción' })
  }
}

// ─── RECIBIR SOLICITUD PÚBLICA ────────────────────────────────────────────────
// Acepta los campos SOLIC_* o los del formulario de la web (nombre, email, telefono, mensaje)
const recibirSolicitud = async (req, res) => {
  const b = req.body ?? {}
  const texto = (v) => (v === undefined || v === null || v === '' ? null : String(v))
  const ADOPCI_ID = b.ADOPCI_ID
  const SOLIC_CE  = texto(b.SOLIC_CE ?? b.cedula)
  const SOLIC_NO  = String(b.SOLIC_NO ?? b.nombre ?? '')
  const SOLIC_EM  = texto(b.SOLIC_EM ?? b.email)
  const SOLIC_TL  = texto(b.SOLIC_TL ?? b.telefono)
  const SOLIC_MO  = texto(b.SOLIC_MO ?? b.mensaje)

  if (!ADOPCI_ID || !SOLIC_NO || !String(SOLIC_NO).trim()) {
    return res.status(400).json({ mensaje: 'El paciente y el nombre del solicitante son obligatorios' })
  }
  if (!/^\d+$/.test(String(ADOPCI_ID))) {
    return res.status(400).json({ mensaje: 'El paciente solicitado no es válido' })
  }

  const cliente = await pool.connect()
  let solicitud, animal
  try {
    await cliente.query('BEGIN')

    const resAnimal = await cliente.query(
      `SELECT adopci_id, adopci_no, adopci_st, adopci_ft FROM TM_ADOPCI WHERE adopci_id = $1 FOR UPDATE`,
      [ADOPCI_ID]
    )
    animal = resAnimal.rows[0]
    if (!animal) {
      await cliente.query('ROLLBACK')
      return res.status(404).json({ mensaje: 'El paciente solicitado no existe' })
    }
    if (animal.adopci_st === 'ADOPTADO') {
      await cliente.query('ROLLBACK')
      return res.status(409).json({ mensaje: `${animal.adopci_no} ya fue adoptado.` })
    }

    // Evita solicitudes repetidas (doble clic o reenvío): misma persona, mismo animal, aún pendiente
    const repetida = await cliente.query(
      `SELECT 1 FROM TT_SOLIC
       WHERE  ADOPCI_ID = $1 AND SOL_ES = 'PENDIENTE'
         AND  ((NULLIF($2, '') IS NOT NULL AND LOWER(SOL_EM) = LOWER($2))
            OR (NULLIF($3, '') IS NOT NULL AND SOL_CE = $3))
       LIMIT 1`,
      [ADOPCI_ID, SOLIC_EM ? String(SOLIC_EM).trim() : '', SOLIC_CE ? String(SOLIC_CE).trim() : '']
    )
    if (repetida.rows.length) {
      await cliente.query('ROLLBACK')
      return res.status(409).json({
        mensaje: `Ya tienes una solicitud en proceso para adoptar a ${animal.adopci_no}. Te contactaremos pronto; puedes consultarla en Seguimiento.`,
      })
    }

    solicitud = (await cliente.query(
      `INSERT INTO TT_SOLIC
         (ADOPCI_ID, SOL_CE, SOL_NO, SOL_EM, SOL_TL, SOL_ME, SOL_ES)
       VALUES ($1, $2, $3, $4, $5, $6, 'PENDIENTE')
       RETURNING *`,
      [ADOPCI_ID, SOLIC_CE, SOLIC_NO.trim(), SOLIC_EM, SOLIC_TL, SOLIC_MO]
    )).rows[0]

    // Con una solicitud en curso el animal pasa a EN PROCESO de inmediato
    await cliente.query(
      `UPDATE TM_ADOPCI SET ADOPCI_ST = 'EN PROCESO' WHERE ADOPCI_ID = $1 AND ADOPCI_ST = 'DISPONIBLE'`,
      [ADOPCI_ID]
    )

    await registrarAuditoria(cliente, {
      modulo: 'ADOPCIONES_PUBLICO',
      accion: `Nueva solicitud de adopción recibida (ADOPCI_ID: ${ADOPCI_ID}) por el solicitante: ${SOLIC_EM}`,
      tipo: 'INFO',
      ip: req.ip
    })

    await cliente.query('COMMIT')
  } catch (error) {
    await cliente.query('ROLLBACK')
    console.error('Error en recibirSolicitud:', error.message)
    if (responderDatosInvalidos(res, error)) return
    return res.status(500).json({ mensaje: 'Error al guardar los datos de la solicitud' })
  } finally {
    cliente.release()
  }

  // Correo al solicitante (si EmailJS está configurado). Un fallo aquí no anula la solicitud.
  const correo = await avisos.solicitudAdopcionRecibida({
    email:   SOLIC_EM,
    nombre:  SOLIC_NO.trim(),
    mascota: animal.adopci_no,
    foto:    conFotoValida(animal).adopci_ft,
  })

  res.status(201).json({
    mensaje:       'Solicitud enviada correctamente',
    registro:      solicitud,
    correoEnviado: correo.enviado,
  })
}

// ─── GESTIONAR SOLICITUD ADMINISTRATIVA ───────────────────────────────────────
const gestionarSolicitud = async (req, res) => {
  const { id } = req.params
  const SOLIC_ES = String(req.body.SOLIC_ES || '').toUpperCase() // 'APROBADA' | 'RECHAZADA' | 'PENDIENTE'
  const { USUARI_ID, ROLREG_ID } = req.usuario

  if (!['PENDIENTE', 'APROBADA', 'RECHAZADA'].includes(SOLIC_ES)) {
    return res.status(400).json({ mensaje: 'SOLIC_ES debe ser PENDIENTE, APROBADA o RECHAZADA' })
  }

  // Al aprobar se registra el animal en el Censo con el adoptante como dueño:
  // la BD exige cédula y sector (se toman en la capacitación presencial).
  const PERSON_CE = String(req.body.PERSON_CE ?? '').trim()
  const SECTOR_ID = Number(req.body.SECTOR_ID)
  if (SOLIC_ES === 'APROBADA') {
    if (PERSON_CE.replace(/\D/g, '').length < 5) {
      return res.status(400).json({ mensaje: 'Para aprobar indique la cédula del adoptante' })
    }
    if (!Number.isInteger(SECTOR_ID)) {
      return res.status(400).json({ mensaje: 'Para aprobar indique el sector donde vivirá el animal' })
    }
  }

  const cliente = await pool.connect()
  try {
    await cliente.query('BEGIN')

    const resSol = await cliente.query(
      `SELECT s.*, a.adopci_no, a.adopci_st, a.especi_id, a.razare_id, a.adopci_se, a.adopci_co, a.adopci_fn, a.adopci_ft
       FROM   TT_SOLIC s
       JOIN   TM_ADOPCI a ON a.adopci_id = s.adopci_id
       WHERE  s.solic_id = $1
       FOR UPDATE OF s, a`,
      [id]
    )
    const sol = resSol.rows[0]
    if (!sol) {
      await cliente.query('ROLLBACK')
      return res.status(404).json({ mensaje: 'Registro no encontrado' })
    }
    if (sol.sol_es === 'APROBADA') {
      await cliente.query('ROLLBACK')
      return res.status(409).json({ mensaje: 'Esta solicitud ya fue aprobada y el animal registrado en el censo; no se puede cambiar.' })
    }

    let censoaId = null
    let otrosPendientes = []   // se les avisa que el animal fue adoptado por otra familia
    if (SOLIC_ES === 'APROBADA') {
      otrosPendientes = (await cliente.query(
        `SELECT sol_no, sol_em FROM TT_SOLIC WHERE ADOPCI_ID = $1 AND SOLIC_ID <> $2 AND SOL_ES = 'PENDIENTE'`,
        [sol.adopci_id, id]
      )).rows
      if (!sol.especi_id) throw new ErrorNegocio('El paciente no tiene una especie del catálogo. Edítelo y asigne la especie antes de aprobar.')
      const sexo = /^m/i.test(sol.adopci_se ?? '') ? 'M' : /^h/i.test(sol.adopci_se ?? '') ? 'H' : null
      if (!sexo) throw new ErrorNegocio('El paciente no tiene sexo registrado. Edítelo antes de aprobar.')
      const sector = await cliente.query('SELECT 1 FROM TM_SECTOR WHERE SECTOR_ID = $1', [SECTOR_ID])
      if (sector.rows.length === 0) throw new ErrorNegocio('El sector seleccionado no es válido')

      // Adoptante en TM_PERSON (se busca por cédula comparando solo los dígitos)
      const existente = await cliente.query(
        `SELECT person_id FROM TM_PERSON WHERE regexp_replace(person_ce, '\\D', '', 'g') = $1 LIMIT 1`,
        [PERSON_CE.replace(/\D/g, '')]
      )
      let personId = existente.rows[0]?.person_id
      if (!personId) {
        const partes = sol.sol_no.trim().split(/\s+/)
        personId = (await cliente.query(
          `INSERT INTO TM_PERSON (PERSON_CE, PERSON_NO, PERSON_AP, PERSON_TL, PERSON_EM)
           VALUES ($1, $2, $3, $4, $5) RETURNING person_id`,
          [PERSON_CE, partes[0], partes.slice(1).join(' ') || partes[0], sol.sol_tl, sol.sol_em]
        )).rows[0].person_id
      }

      // El trigger siscvi_aprobar_solicitud marca el animal ADOPTADO y rechaza las demás pendientes
      await cliente.query(
        `UPDATE TT_SOLIC SET SOL_ES = 'APROBADA', USUARI_ID = $2, PERSON_ID = $3, SOL_CE = $4 WHERE SOLIC_ID = $1`,
        [id, USUARI_ID, personId, PERSON_CE]
      )

      const colore = sol.adopci_co
        ? (await cliente.query(`SELECT colore_id FROM TM_COLORE WHERE LOWER(colore_no) = LOWER($1) LIMIT 1`, [sol.adopci_co])).rows[0]?.colore_id ?? null
        : null

      censoaId = (await cliente.query(
        `INSERT INTO TT_CENSOA
           (PERSON_ID, ESPECI_ID, RAZARE_ID, SECTOR_ID, COLORE_ID, NOM_ANIMA, SEX_ANIMA, EDA_ANIMA, FEC_CENSO, USUARI_ID)
         VALUES ($1, $2, $3, $4, $5, $6, $7,
                 COALESCE((EXTRACT(YEAR FROM age($8::date)) * 12 + EXTRACT(MONTH FROM age($8::date)))::int, 0),
                 CURRENT_DATE, $9)
         RETURNING censoa_id`,
        [personId, sol.especi_id, sol.razare_id, SECTOR_ID, colore, sol.adopci_no, sexo, sol.adopci_fn, USUARI_ID]
      )).rows[0].censoa_id

      await cliente.query(`UPDATE TM_ADOPCI SET CENSOA_ID = $1 WHERE ADOPCI_ID = $2`, [censoaId, sol.adopci_id])
    } else {
      await cliente.query(
        `UPDATE TT_SOLIC SET SOL_ES = $1, USUARI_ID = $3 WHERE SOLIC_ID = $2`,
        [SOLIC_ES, id, USUARI_ID]
      )
      // Si ya no quedan solicitudes pendientes, el animal vuelve a estar disponible
      if (SOLIC_ES === 'RECHAZADA') {
        await cliente.query(
          `UPDATE TM_ADOPCI SET ADOPCI_ST = 'DISPONIBLE'
           WHERE  ADOPCI_ID = $1 AND ADOPCI_ST = 'EN PROCESO'
             AND  NOT EXISTS (SELECT 1 FROM TT_SOLIC WHERE ADOPCI_ID = $1 AND SOL_ES = 'PENDIENTE')`,
          [sol.adopci_id]
        )
      }
    }

    await registrarAuditoria(cliente, {
      usuari_id: USUARI_ID,
      rol: ROLREG_ID,
      modulo: 'ADOPCIONES_ADMIN',
      accion: SOLIC_ES === 'APROBADA'
        ? `Solicitud ${id} APROBADA — ${sol.adopci_no} adoptado por ${sol.sol_no} (CI ${PERSON_CE}); registrado en censo #${censoaId}`
        : `Solicitud ${id} actualizada a estado: ${SOLIC_ES}`,
      tipo: 'INFO',
      ip: req.ip
    })

    await cliente.query('COMMIT')

    // Avisos por correo (en segundo plano: no retrasan ni afectan la respuesta)
    if (SOLIC_ES === 'APROBADA') {
      avisos.adopcionAprobada({ email: sol.sol_em, nombre: sol.sol_no, mascota: sol.adopci_no, foto: conFotoValida(sol).adopci_ft })
      otrosPendientes.forEach(o => avisos.adoptadoPorOtraFamilia({ email: o.sol_em, nombre: o.sol_no, mascota: sol.adopci_no }))
    } else if (SOLIC_ES === 'RECHAZADA' && sol.sol_es !== 'RECHAZADA') {
      avisos.adopcionNoAprobada({ email: sol.sol_em, nombre: sol.sol_no, mascota: sol.adopci_no })
    }

    const registro = (await pool.query(`SELECT * FROM TT_SOLIC WHERE SOLIC_ID = $1`, [id])).rows[0]
    res.json({
      mensaje:  SOLIC_ES === 'APROBADA'
        ? `Adopción aprobada. ${sol.adopci_no} quedó registrado en el Censo Animal.`
        : `Solicitud marcada como ${SOLIC_ES}`,
      registro,
      censoa_id: censoaId,
    })
  } catch (error) {
    await cliente.query('ROLLBACK')
    if (error instanceof ErrorNegocio) {
      return res.status(400).json({ mensaje: error.message })
    }
    console.error('Error en gestionarSolicitud:', error.message)
    if (responderDatosInvalidos(res, error)) return
    res.status(500).json({ mensaje: 'Error al modificar los detalles de la solicitud' })
  } finally {
    cliente.release()
  }
}

// Error de validación dentro de una transacción → respuesta 400 con su mensaje
class ErrorNegocio extends Error {}

// ─── MODIFICAR DATOS DE UN PACIENTE — PUT /api/adopciones/:id ────────────────
const actualizarPaciente = async (req, res) => {
  const { id } = req.params
  const { USUARI_ID, ROLREG_ID } = req.usuario
  const { nombre, especie, sexo, raza, color, fecha_nacimiento, peso, descripcion } = req.body

  if (!nombre || !nombre.trim() || !sexo) {
    return res.status(400).json({ mensaje: 'Nombre y sexo son obligatorios' })
  }

  const cliente = await pool.connect()
  try {
    await cliente.query('BEGIN')
    const { especiId, razaId } = await resolverCatalogo(cliente, especie, raza)

    const resultado = await cliente.query(
      `UPDATE TM_ADOPCI
       SET    ADOPCI_NO = $1, ADOPCI_SE = $2, ADOPCI_CO = $3, ADOPCI_FN = $4,
              ADOPCI_PE = $5, ADOPCI_DE = $6, ESPECI_ID = $7, RAZARE_ID = $8
       WHERE  ADOPCI_ID = $9
       RETURNING adopci_id`,
      [nombre.trim(), sexo, color || null, fecha_nacimiento || null, peso || null,
       descripcion || null, especiId, razaId, id]
    )
    if (resultado.rows.length === 0) {
      await cliente.query('ROLLBACK')
      return res.status(404).json({ mensaje: 'Paciente no encontrado' })
    }

    await registrarAuditoria(cliente, {
      usuari_id: USUARI_ID,
      rol:       ROLREG_ID,
      modulo:    'ADOPCIONES_ADMIN',
      accion:    `Datos del paciente actualizados: ${nombre.trim()} (ID: ${id})`,
      tipo:      'INFO',
      ip:        req.ip,
    })
    await cliente.query('COMMIT')

    const paciente = conFotoValida(await obtenerPacienteCompleto(pool, id))
    res.json({ mensaje: 'Datos del paciente actualizados', paciente })
  } catch (error) {
    await cliente.query('ROLLBACK')
    console.error('Error en actualizarPaciente:', error.message)
    if (responderDatosInvalidos(res, error)) return
    res.status(500).json({ mensaje: 'Error al actualizar los datos del paciente' })
  } finally {
    cliente.release()
  }
}

// ─── REGISTRAR NUEVO ANIMAL EN CARTELERA (ADMIN) ─────────────────────────────
const registrarPaciente = async (req, res) => {
  const {
    nombre, especie, sexo, raza,
    color, fecha_nacimiento, peso, descripcion,
  } = req.body

  if (!nombre || !sexo) {
    return res.status(400).json({ mensaje: 'Nombre y sexo son obligatorios' })
  }

  let fotoUrl = null
  if (req.file) {
    try {
      fotoUrl = await subirFoto(req.file.buffer)
    } catch (uploadError) {
      console.error('Error subiendo foto a Cloudinary:', uploadError.message)
    }
  }

  try {
    const { especiId, razaId } = await resolverCatalogo(pool, especie, raza)

    const resultado = await pool.query(
      `INSERT INTO TM_ADOPCI
         (ADOPCI_NO, ADOPCI_SE, ADOPCI_CO, ADOPCI_FN, ADOPCI_PE, ADOPCI_DE, ADOPCI_FT, ADOPCI_ST, ADOPCI_VW, ESPECI_ID, RAZARE_ID)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'DISPONIBLE', false, $8, $9)
       RETURNING *`,
      [
        nombre,
        sexo,
        color    || null,
        fecha_nacimiento || null,
        peso     || null,
        descripcion || null,
        fotoUrl,
        especiId,
        razaId,
      ]
    )

    await registrarAuditoria(pool, {
      modulo: 'ADOPCIONES_ADMIN',
      accion: `Nuevo paciente registrado en cartelera: ${nombre}${especie ? ` (${especie})` : ''}`,
      tipo: 'INFO',
      ip: req.ip,
    })

    res.status(201).json({
      mensaje:  'Paciente registrado en la cartelera de adopción',
      paciente: conFotoValida(await obtenerPacienteCompleto(pool, resultado.rows[0].adopci_id)),
    })
  } catch (error) {
    console.error('Error en registrarPaciente:', error.message)
    if (responderDatosInvalidos(res, error)) return
    res.status(500).json({ mensaje: 'Error al registrar el paciente en la cartelera' })
  }
}

// ─── AGREGAR O CAMBIAR FOTO — PATCH /api/adopciones/:id/foto (campo 'foto') ──
const cambiarFoto = async (req, res) => {
  const { id } = req.params
  const { USUARI_ID, ROLREG_ID } = req.usuario

  if (!req.file) {
    return res.status(400).json({ mensaje: 'Debe seleccionar una imagen' })
  }

  let fotoUrl
  try {
    fotoUrl = await subirFoto(req.file.buffer)
  } catch (uploadError) {
    console.error('Error subiendo foto a Cloudinary:', uploadError.message)
    return res.status(502).json({ mensaje: 'No se pudo subir la imagen al almacenamiento. Intente de nuevo.' })
  }

  try {
    const resultado = await pool.query(
      `UPDATE TM_ADOPCI SET ADOPCI_FT = $1 WHERE ADOPCI_ID = $2 RETURNING *`,
      [fotoUrl, id]
    )
    if (resultado.rows.length === 0) {
      return res.status(404).json({ mensaje: 'Paciente no encontrado' })
    }

    await registrarAuditoria(pool, {
      usuari_id: USUARI_ID,
      rol:       ROLREG_ID,
      modulo:    'ADOPCIONES_ADMIN',
      accion:    `Foto actualizada del paciente ${resultado.rows[0].adopci_no} (ID: ${id})`,
      tipo:      'INFO',
      ip:        req.ip,
    })

    res.json({ mensaje: 'Foto actualizada correctamente', paciente: resultado.rows[0] })
  } catch (error) {
    console.error('Error en cambiarFoto:', error.message)
    if (responderDatosInvalidos(res, error)) return
    res.status(500).json({ mensaje: 'Error al guardar la foto del paciente' })
  }
}

module.exports = { obtenerCatalogo, obtenerSolicitudes, recibirSolicitud, gestionarSolicitud, registrarPaciente, actualizarPaciente, cambiarFoto }
