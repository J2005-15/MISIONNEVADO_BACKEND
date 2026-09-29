const bcrypt = require('bcrypt')
const crypto = require('crypto')
const jwt    = require('jsonwebtoken')
const { pool } = require('../config/db')
const { responderDatosInvalidos } = require('../helpers/erroresBD')
const { registrarAuditoria } = require('../helpers/auditoria')
const { obtenerConfigSistema } = require('../helpers/configSistema')
const { codigoRecuperacion, claveRestablecida } = require('../helpers/avisos')
const { ROL } = require('../middlewares/authMiddleware')

// ── POST /api/auth/login ───────────────────────────────────────────────────────
const login = async (req, res) => {
  const { USR_LOGIN, PWD_LOGIN } = req.body
  const ip = req.ip || req.connection?.remoteAddress || null

  if (!USR_LOGIN || !PWD_LOGIN) {
    return res.status(400).json({ mensaje: 'Usuario/correo y contraseña son obligatorios' })
  }

  try {
    const resultado = await pool.query(
      `SELECT u.USUARI_ID, u.USUARI_NO, u.USUARI_EM, u.USUARI_CL, u.USUARI_ES,
              u.ROLREG_ID, r.ROLREG_NO,
              p.PERSON_NO, p.PERSON_AP
       FROM   TM_USUARIO u
       JOIN   TM_ROLREG  r ON r.ROLREG_ID = u.ROLREG_ID
       LEFT JOIN TM_PERSON p ON p.PERSON_ID = u.PERSON_ID
       WHERE  u.USUARI_NO = $1 OR u.USUARI_EM = $1`,
      [USR_LOGIN.trim()]
    )

    if (resultado.rows.length === 0) {
      await registrarAuditoria(null, {
        modulo: 'Acceso',
        accion: `Intento fallido — usuario no encontrado: ${USR_LOGIN}`,
        tipo:   'ALERTA',
        ip,
      })
      return res.status(401).json({ mensaje: 'Credenciales incorrectas' })
    }

    const usuario = resultado.rows[0]

    if (usuario.usuari_es !== 'ACTIVO') {
      return res.status(403).json({
        mensaje: 'Cuenta inactiva o bloqueada. Comuníquese con el administrador.',
      })
    }

    const claveValida = await bcrypt.compare(PWD_LOGIN, usuario.usuari_cl)
    if (!claveValida) {
      await registrarAuditoria(null, {
        email:  usuario.usuari_em,
        rol:    usuario.rolreg_no,
        modulo: 'Acceso',
        accion: `Intento fallido — contraseña incorrecta: ${USR_LOGIN}`,
        tipo:   'ALERTA',
        ip,
      })
      return res.status(401).json({ mensaje: 'Credenciales incorrectas' })
    }

    // Solo los roles que el panel conoce pueden entrar; cualquier otro no tiene acceso
    if (!Object.values(ROL).includes(Number(usuario.rolreg_id))) {
      await registrarAuditoria(null, {
        usuari_id: usuario.usuari_id,
        email:     usuario.usuari_em,
        rol:       usuario.rolreg_no,
        modulo:    'Acceso',
        accion:    `Ingreso rechazado — rol sin acceso al panel: ${usuario.rolreg_no}`,
        tipo:      'ALERTA',
        ip,
      })
      return res.status(403).json({
        mensaje: `Su rol (${usuario.rolreg_no}) no tiene acceso al panel. Comuníquese con el administrador.`,
      })
    }

    // Duración definida en "Configuración del Sistema" (por defecto 8 horas)
    const { sesionHoras } = await obtenerConfigSistema()
    const token = jwt.sign(
      { USUARI_ID: usuario.usuari_id, ROLREG_ID: usuario.rolreg_id },
      process.env.JWT_SECRET,
      { expiresIn: `${sesionHoras}h` }
    )

    await registrarAuditoria(null, {
      usuari_id: usuario.usuari_id,
      email:     usuario.usuari_em,
      rol:       usuario.rolreg_no,
      modulo:    'Acceso',
      accion:    'Inicio de sesión exitoso',
      tipo:      'INFO',
      ip,
    })

    res.json({
      mensaje: 'Inicio de sesión exitoso',
      token,
      usuario: {
        USUARI_ID: usuario.usuari_id,
        USUARI_NO: usuario.usuari_no,
        USUARI_EM: usuario.usuari_em,
        ROLREG_ID: usuario.rolreg_id,
        ROLREG_NO: usuario.rolreg_no,
        PERSON_NO: usuario.person_no,
        PERSON_AP: usuario.person_ap,
      },
    })
  } catch (error) {
    console.error('Error en login:', error.message)
    if (responderDatosInvalidos(res, error)) return
    res.status(500).json({ mensaje: 'Error interno durante el inicio de sesión' })
  }
}

// ── GET /api/auth/perfil ───────────────────────────────────────────────────────
const obtenerPerfil = async (req, res) => {
  const { USUARI_ID } = req.usuario

  try {
    const resultado = await pool.query(
      `SELECT u.USUARI_ID, u.USUARI_NO, u.USUARI_EM, u.USUARI_ES, u.USUARI_FE,
              r.ROLREG_NO,
              p.PERSON_NO, p.PERSON_AP, p.PERSON_CE,
              p.PERSON_TL, p.PERSON_EM, p.PERSON_DI, p.PERSON_PA
       FROM   TM_USUARIO u
       JOIN   TM_ROLREG  r ON r.ROLREG_ID = u.ROLREG_ID
       LEFT JOIN TM_PERSON p ON p.PERSON_ID = u.PERSON_ID
       WHERE  u.USUARI_ID = $1`,
      [USUARI_ID]
    )

    if (resultado.rows.length === 0) {
      return res.status(404).json({ mensaje: 'Perfil no encontrado' })
    }

    const d = resultado.rows[0]
    res.json({
      USUARI_ID: d.usuari_id,
      USUARI_NO: d.usuari_no,
      USUARI_ES: d.usuari_es,
      USUARI_FE: d.usuari_fe,
      ROLREG_NO: d.rolreg_no,
      email:     d.usuari_em,
      nombre:    d.person_no ? `${d.person_no} ${d.person_ap ?? ''}`.trim() : d.usuari_no,
      PERSON_NO: d.person_no,
      PERSON_AP: d.person_ap,
      PERSON_CE: d.person_ce,
      PERSON_TL: d.person_tl,
      PERSON_EM: d.person_em,
      PERSON_DI: d.person_di,
      PERSON_PA: d.person_pa,
    })
  } catch (error) {
    console.error('Error en obtenerPerfil:', error.message)
    if (responderDatosInvalidos(res, error)) return
    res.status(500).json({ mensaje: 'Error al obtener el perfil' })
  }
}

// ── PATCH /api/auth/perfil/email ───────────────────────────────────────────────
const actualizarEmail = async (req, res) => {
  const { USUARI_ID } = req.usuario
  const email         = String(req.body?.email ?? '')

  if (!email || !email.trim()) {
    return res.status(400).json({ mensaje: 'El correo electrónico es obligatorio' })
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return res.status(400).json({ mensaje: 'El correo electrónico no tiene un formato válido' })
  }

  const cliente = await pool.connect()
  try {
    await cliente.query('BEGIN')

    const resUsuario = await cliente.query(
      `UPDATE TM_USUARIO
       SET    USUARI_EM = $1
       WHERE  USUARI_ID = $2
       RETURNING USUARI_ID, USUARI_EM`,
      [email.trim(), USUARI_ID]
    )

    if (resUsuario.rows.length === 0) {
      await cliente.query('ROLLBACK')
      return res.status(404).json({ mensaje: 'Usuario no encontrado' })
    }

    // Sincronizar PERSON_EM si existe registro vinculado
    await cliente.query(
      `UPDATE TM_PERSON
       SET    PERSON_EM = $1
       WHERE  PERSON_ID = (
         SELECT PERSON_ID FROM TM_USUARIO
         WHERE  USUARI_ID = $2 AND PERSON_ID IS NOT NULL
       )`,
      [email.trim(), USUARI_ID]
    )

    await cliente.query('COMMIT')

    res.json({
      mensaje:   'Correo actualizado correctamente',
      USUARI_EM: resUsuario.rows[0].usuari_em,
    })
  } catch (error) {
    await cliente.query('ROLLBACK')
    if (error.code === '23505') {
      return res.status(409).json({ mensaje: 'Este correo ya está registrado por otro usuario' })
    }
    console.error('Error en actualizarEmail:', error.message)
    if (responderDatosInvalidos(res, error)) return
    res.status(500).json({ mensaje: 'Error al actualizar el correo' })
  } finally {
    cliente.release()
  }
}

// ── PATCH /api/auth/perfil/password ───────────────────────────────────────────
const cambiarPassword = async (req, res) => {
  const { USUARI_ID }   = req.usuario
  const actual = String(req.body?.actual ?? '')
  const nueva  = String(req.body?.nueva ?? '')

  if (!actual || !nueva) {
    return res.status(400).json({ mensaje: 'La contraseña actual y la nueva son obligatorias' })
  }
  if (nueva.length < 8) {
    return res.status(400).json({ mensaje: 'La nueva contraseña debe tener al menos 8 caracteres' })
  }

  try {
    const resultado = await pool.query(
      `SELECT USUARI_CL FROM TM_USUARIO WHERE USUARI_ID = $1`,
      [USUARI_ID]
    )

    if (resultado.rows.length === 0) {
      return res.status(404).json({ mensaje: 'Usuario no encontrado' })
    }

    const claveValida = await bcrypt.compare(actual, resultado.rows[0].usuari_cl)
    if (!claveValida) {
      // 403 y no 401: el panel interpreta 401 como sesión vencida y cerraría la sesión
      return res.status(403).json({ mensaje: 'Contraseña actual incorrecta' })
    }
    if (nueva === actual) {
      return res.status(400).json({ mensaje: 'La nueva contraseña no puede ser igual a la anterior' })
    }

    const nuevoHash = await bcrypt.hash(nueva, 12)

    await pool.query(
      `UPDATE TM_USUARIO SET USUARI_CL = $1 WHERE USUARI_ID = $2`,
      [nuevoHash, USUARI_ID]
    )

    res.json({ mensaje: 'Contraseña actualizada correctamente' })
  } catch (error) {
    console.error('Error en cambiarPassword:', error.message)
    if (responderDatosInvalidos(res, error)) return
    res.status(500).json({ mensaje: 'Error al cambiar la contraseña' })
  }
}

// ── PATCH /api/auth/perfil/telefono ───────────────────────────────────────────
// Cada usuario actualiza su propio teléfono (TM_PERSON.PERSON_TL, máx. 15 caracteres)
const actualizarTelefono = async (req, res) => {
  const { USUARI_ID } = req.usuario
  const telefono = String(req.body?.telefono ?? '').trim()

  if (!telefono) {
    return res.status(400).json({ mensaje: 'El teléfono es obligatorio' })
  }
  if (!/^[+\d][\d\s()-]{6,14}$/.test(telefono) || (telefono.match(/\d/g) ?? []).length < 7) {
    return res.status(400).json({ mensaje: 'El teléfono no tiene un formato válido (ej. 0414-1234567)' })
  }

  try {
    const resultado = await pool.query(
      `UPDATE TM_PERSON
       SET    PERSON_TL = $1
       WHERE  PERSON_ID = (SELECT PERSON_ID FROM TM_USUARIO WHERE USUARI_ID = $2)
       RETURNING PERSON_TL`,
      [telefono, USUARI_ID]
    )
    if (resultado.rows.length === 0) {
      return res.status(400).json({ mensaje: 'Su usuario no tiene datos personales vinculados. Pida al administrador que los registre.' })
    }

    await registrarAuditoria(null, {
      usuari_id: USUARI_ID,
      modulo:    'Perfil',
      accion:    'Teléfono de contacto actualizado',
      tipo:      'INFO',
    })

    res.json({ mensaje: 'Teléfono actualizado correctamente', PERSON_TL: resultado.rows[0].person_tl })
  } catch (error) {
    console.error('Error en actualizarTelefono:', error.message)
    if (responderDatosInvalidos(res, error)) return
    res.status(500).json({ mensaje: 'Error al actualizar el teléfono' })
  }
}

// ── RECUPERACIÓN DE CONTRASEÑA (desde el login, sin sesión) ───────────────────
// 1) POST /api/auth/recuperar   { identificador }  → envía un código de 6 dígitos
// 2) POST /api/auth/restablecer { identificador, codigo, nueva }
// Solo se guarda la huella del código; vence según "Configuración del Sistema"
// y admite 5 intentos. La respuesta del paso 1 es la misma exista o no la cuenta,
// para no revelar qué correos están registrados.
const MAX_INTENTOS = 5
const MSG_CODIGO_ENVIADO = 'Si los datos corresponden a una cuenta activa, enviamos un código de 6 dígitos al correo registrado. Revise también la carpeta de spam.'
const MSG_CODIGO_INVALIDO = 'El código no es válido o ya venció. Solicite uno nuevo.'

const huellaCodigo = (usuariId, codigo) =>
  crypto.createHmac('sha256', process.env.JWT_SECRET).update(`${usuariId}:${codigo}`).digest('hex')

const buscarCuenta = async (identificador) => (await pool.query(
  `SELECT u.USUARI_ID, u.USUARI_NO, u.USUARI_EM, u.USUARI_ES, p.PERSON_NO
   FROM   TM_USUARIO u
   LEFT JOIN TM_PERSON p ON p.PERSON_ID = u.PERSON_ID
   WHERE  LOWER(u.USUARI_EM) = LOWER($1) OR LOWER(u.USUARI_NO) = LOWER($1)
   ORDER  BY (LOWER(u.USUARI_EM) = LOWER($1)) DESC
   LIMIT  1`,
  [identificador]
)).rows[0]

const correoConfigurado = () => {
  const { EMAILJS_SERVICE_ID, EMAILJS_PUBLIC_KEY, EMAILJS_PRIVATE_KEY } = process.env
  return Boolean(EMAILJS_SERVICE_ID && EMAILJS_PUBLIC_KEY && EMAILJS_PRIVATE_KEY)
}

const solicitarRecuperacion = async (req, res) => {
  const identificador = String(req.body?.identificador ?? '').trim()
  const ip = req.ip || null

  if (!identificador) {
    return res.status(400).json({ mensaje: 'Escriba el correo o usuario de su cuenta' })
  }
  if (!correoConfigurado()) {
    return res.status(503).json({ mensaje: 'El envío de correos no está configurado. Comuníquese con el administrador del sistema.' })
  }

  try {
    const cuenta = await buscarCuenta(identificador)
    if (!cuenta || cuenta.usuari_es !== 'ACTIVO' || !cuenta.usuari_em) {
      await registrarAuditoria(null, {
        modulo: 'Acceso',
        accion: `Recuperación de contraseña solicitada para una cuenta inexistente o inactiva: ${identificador}`,
        tipo:   'ALERTA',
        ip,
      })
      return res.json({ mensaje: MSG_CODIGO_ENVIADO })
    }

    // Límite anti-abuso (y para cuidar la cuota de EmailJS): 1 código por minuto, 5 por hora
    const { minuto, hora } = (await pool.query(
      `SELECT COUNT(*) FILTER (WHERE RECUP_FE > NOW() - INTERVAL '1 minute')::int AS minuto,
              COUNT(*)::int AS hora
       FROM   TT_RECUP
       WHERE  USUARI_ID = $1 AND RECUP_FE > NOW() - INTERVAL '1 hour'`,
      [cuenta.usuari_id]
    )).rows[0]
    if (minuto > 0 || hora >= 5) {
      return res.json({ mensaje: MSG_CODIGO_ENVIADO })
    }

    const { recuperacionMinutos } = await obtenerConfigSistema()
    const codigo = String(crypto.randomInt(0, 1000000)).padStart(6, '0')

    const cliente = await pool.connect()
    let recupId
    try {
      await cliente.query('BEGIN')
      // Un código nuevo anula los anteriores
      await cliente.query('UPDATE TT_RECUP SET RECUP_US = TRUE WHERE USUARI_ID = $1 AND NOT RECUP_US', [cuenta.usuari_id])
      recupId = (await cliente.query(
        `INSERT INTO TT_RECUP (USUARI_ID, RECUP_CO, RECUP_EX)
         VALUES ($1, $2, NOW() + make_interval(mins => $3))
         RETURNING RECUP_ID`,
        [cuenta.usuari_id, huellaCodigo(cuenta.usuari_id, codigo), recuperacionMinutos]
      )).rows[0].recup_id
      await cliente.query('COMMIT')
    } catch (error) {
      await cliente.query('ROLLBACK')
      throw error
    } finally {
      cliente.release()
    }

    const envio = await codigoRecuperacion({
      email:   cuenta.usuari_em,
      nombre:  cuenta.person_no || cuenta.usuari_no,
      codigo,
      minutos: recuperacionMinutos,
    })
    if (!envio.enviado) {
      await pool.query('UPDATE TT_RECUP SET RECUP_US = TRUE WHERE RECUP_ID = $1', [recupId])
      console.error('No se pudo enviar el código de recuperación:', envio.motivo)
      return res.status(502).json({ mensaje: 'No se pudo enviar el correo en este momento. Intente de nuevo en unos minutos.' })
    }

    await registrarAuditoria(null, {
      usuari_id: cuenta.usuari_id,
      email:     cuenta.usuari_em,
      modulo:    'Acceso',
      accion:    'Código de recuperación de contraseña enviado al correo',
      tipo:      'ALERTA',
      ip,
    })
    res.json({ mensaje: MSG_CODIGO_ENVIADO })
  } catch (error) {
    console.error('Error en solicitarRecuperacion:', error.message)
    if (responderDatosInvalidos(res, error)) return
    res.status(500).json({ mensaje: 'No se pudo procesar la solicitud. Intente de nuevo.' })
  }
}

const restablecerClave = async (req, res) => {
  const identificador = String(req.body?.identificador ?? '').trim()
  const codigo        = String(req.body?.codigo ?? '').replace(/\s/g, '')
  const nueva         = String(req.body?.nueva ?? '')
  const ip = req.ip || null

  if (!identificador) return res.status(400).json({ mensaje: 'Escriba el correo o usuario de su cuenta' })
  if (!/^\d{6}$/.test(codigo)) return res.status(400).json({ mensaje: 'El código debe tener 6 dígitos' })
  if (nueva.length < 8) return res.status(400).json({ mensaje: 'La nueva contraseña debe tener al menos 8 caracteres' })

  const cliente = await pool.connect()
  try {
    const cuenta = await buscarCuenta(identificador)
    if (!cuenta || cuenta.usuari_es !== 'ACTIVO') {
      return res.status(400).json({ mensaje: MSG_CODIGO_INVALIDO })
    }

    await cliente.query('BEGIN')
    const fila = (await cliente.query(
      `SELECT RECUP_ID, RECUP_CO, RECUP_IN
       FROM   TT_RECUP
       WHERE  USUARI_ID = $1 AND NOT RECUP_US AND RECUP_EX > NOW()
       ORDER  BY RECUP_FE DESC
       LIMIT  1
       FOR UPDATE`,
      [cuenta.usuari_id]
    )).rows[0]

    if (!fila || fila.recup_in >= MAX_INTENTOS) {
      await cliente.query('ROLLBACK')
      return res.status(400).json({ mensaje: MSG_CODIGO_INVALIDO })
    }

    const esperado = Buffer.from(fila.recup_co, 'hex')
    const recibido = Buffer.from(huellaCodigo(cuenta.usuari_id, codigo), 'hex')
    if (esperado.length !== recibido.length || !crypto.timingSafeEqual(esperado, recibido)) {
      const intentos = fila.recup_in + 1
      await cliente.query(
        'UPDATE TT_RECUP SET RECUP_IN = $1, RECUP_US = $2 WHERE RECUP_ID = $3',
        [intentos, intentos >= MAX_INTENTOS, fila.recup_id]
      )
      await cliente.query('COMMIT')
      const quedan = MAX_INTENTOS - intentos
      return res.status(400).json({
        mensaje: quedan > 0
          ? `Código incorrecto. Le quedan ${quedan} intento${quedan === 1 ? '' : 's'}.`
          : 'Código incorrecto. Se agotaron los intentos: solicite un código nuevo.',
      })
    }

    // Recién aquí (código ya verificado) se compara con la clave actual: así no sirve
    // para adivinar contraseñas. El código NO se gasta: puede elegir otra y reintentar.
    const actual = (await cliente.query('SELECT USUARI_CL FROM TM_USUARIO WHERE USUARI_ID = $1', [cuenta.usuari_id])).rows[0]
    if (await bcrypt.compare(nueva, actual.usuari_cl)) {
      await cliente.query('ROLLBACK')
      return res.status(400).json({ mensaje: 'La nueva contraseña no puede ser igual a la anterior. Elija una diferente.' })
    }

    const nuevoHash = await bcrypt.hash(nueva, 12)
    await cliente.query('UPDATE TM_USUARIO SET USUARI_CL = $1 WHERE USUARI_ID = $2', [nuevoHash, cuenta.usuari_id])
    await cliente.query('UPDATE TT_RECUP SET RECUP_US = TRUE WHERE USUARI_ID = $1 AND NOT RECUP_US', [cuenta.usuari_id])
    await registrarAuditoria(cliente, {
      usuari_id: cuenta.usuari_id,
      email:     cuenta.usuari_em,
      modulo:    'Acceso',
      accion:    'Contraseña restablecida con código enviado al correo',
      tipo:      'ALERTA',
      ip,
    })
    await cliente.query('COMMIT')

    claveRestablecida({ email: cuenta.usuari_em, nombre: cuenta.person_no || cuenta.usuari_no })
    res.json({ mensaje: 'Contraseña restablecida. Ya puede iniciar sesión con su nueva contraseña.' })
  } catch (error) {
    await cliente.query('ROLLBACK').catch(() => {})
    console.error('Error en restablecerClave:', error.message)
    if (responderDatosInvalidos(res, error)) return
    res.status(500).json({ mensaje: 'No se pudo restablecer la contraseña. Intente de nuevo.' })
  } finally {
    cliente.release()
  }
}

module.exports = {
  login, obtenerPerfil, actualizarEmail, cambiarPassword, actualizarTelefono,
  solicitarRecuperacion, restablecerClave,
}
