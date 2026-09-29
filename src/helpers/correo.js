// Envío de correos con EmailJS (API REST, desde el servidor).
//
// Se usa UNA sola plantilla para todos los avisos (confirmaciones y cambios de
// estado): docs/emailjs/plantilla-general.html. El contenido cambia según el
// caso y se arma aquí con los bloques de más abajo.
//
// Requiere en .env / variables de Render:
//   EMAILJS_SERVICE_ID, EMAILJS_PUBLIC_KEY, EMAILJS_PRIVATE_KEY, EMAILJS_TEMPLATE_ID
// y en EmailJS: Account → Security → "Allow EmailJS API for non-browser applications".
//
// Si falta alguna variable no se envía nada y no se considera error: el trámite
// sigue su curso normal.
const { pool } = require('../config/db')
const { obtenerConfigSistema } = require('./configSistema')

const URL_EMAILJS = 'https://api.emailjs.com/api/v1.0/email/send'
const LOGO_MISION = 'https://res.cloudinary.com/dhilpvzef/image/upload/v1782364545/Logo_Nevado_glcikr.png'

const idPlantilla = () => process.env.EMAILJS_TEMPLATE_ID || process.env.EMAILJS_TEMPLATE_SOLICITUD

const enviarCorreo = async (templateId, parametros) => {
  const { EMAILJS_SERVICE_ID, EMAILJS_PUBLIC_KEY, EMAILJS_PRIVATE_KEY } = process.env

  if (!EMAILJS_SERVICE_ID || !EMAILJS_PUBLIC_KEY || !EMAILJS_PRIVATE_KEY || !templateId) {
    return { enviado: false, motivo: 'EmailJS no configurado' }
  }
  if (!parametros.to_email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parametros.to_email)) {
    return { enviado: false, motivo: 'Sin correo de destino válido' }
  }

  try {
    const respuesta = await fetch(URL_EMAILJS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_id:      EMAILJS_SERVICE_ID,
        template_id:     templateId,
        user_id:         EMAILJS_PUBLIC_KEY,
        accessToken:     EMAILJS_PRIVATE_KEY,
        template_params: parametros,
      }),
      signal: AbortSignal.timeout(10000),
    })
    if (!respuesta.ok) {
      const detalle = await respuesta.text().catch(() => '')
      console.error(`EmailJS respondió ${respuesta.status}: ${detalle}`)
      return { enviado: false, motivo: `EmailJS ${respuesta.status}` }
    }
    return { enviado: true }
  } catch (error) {
    console.error('No se pudo enviar el correo con EmailJS:', error.message)
    return { enviado: false, motivo: error.message }
  }
}

// ─── Bloques HTML del contenido (estilos en línea, mismos colores de la web) ──
const escapar = (t) => String(t ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const bloques = {
  // Texto que viene de formularios: siempre escapado antes de entrar al HTML
  texto: escapar,

  parrafo: (texto) =>
    `<p style="margin:0 0 14px 0; font-size:16px; line-height:1.6; color:#495057;">${texto}</p>`,

  destacado: (texto) => `<strong style="color:#2D6A4F;">${escapar(texto)}</strong>`,

  // Foto (del animal, por ejemplo) sobre fondo crema
  foto: (url, pie, subpie = '') => `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#FFEFD1; border-radius:20px; margin:8px 0 18px 0;">
      <tr><td align="center" style="padding:16px;">
        <img src="${escapar(url)}" alt="${escapar(pie)}" width="480" style="display:block; width:100%; max-width:480px; height:auto; border:0; border-radius:14px;">
        <p style="margin:12px 0 0 0; font-size:18px; font-weight:800; color:#212529;">${escapar(pie)}</p>
        ${subpie ? `<p style="margin:4px 0 0 0; font-size:12px; font-weight:bold; letter-spacing:1px; text-transform:uppercase; color:#E9A23B;">&#9679;&nbsp; ${escapar(subpie)}</p>` : ''}
      </td></tr>
    </table>`,

  // Lista numerada de pasos ("¿Qué sigue ahora?")
  pasos: (titulo, lista) => `
    <h2 style="margin:10px 0 14px 0; font-size:17px; font-weight:800; color:#2D6A4F;">${escapar(titulo)}</h2>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:6px;">
      ${lista.map((paso, i) => `
      <tr>
        <td width="40" valign="top" style="padding:0 0 14px 0;">
          <div style="width:28px; height:28px; line-height:28px; text-align:center; border-radius:999px; background-color:${i === lista.length - 1 ? '#D4AC4E' : '#2D6A4F'}; color:${i === lista.length - 1 ? '#212529' : '#ffffff'}; font-size:13px; font-weight:bold;">${i + 1}</div>
        </td>
        <td valign="top" style="padding:3px 0 14px 0; font-size:15px; line-height:1.5; color:#495057;">${paso}</td>
      </tr>`).join('')}
    </table>`,

  // Recuadro de estado (verde = bueno, dorado = en curso, gris = cerrado/no aprobado)
  estado: (texto, tono = 'verde') => {
    const t = { verde: ['#E8F3EE', '#2D6A4F'], dorado: ['#FFF4DC', '#9A6B00'], gris: ['#F1F3F5', '#495057'] }[tono]
    return `<p style="margin:4px 0 18px 0; padding:12px 16px; border-radius:12px; background-color:${t[0]}; color:${t[1]}; font-size:14px; font-weight:bold;">${escapar(texto)}</p>`
  },
}

// Datos de contacto publicados en la web (TM_CONFIG)
const obtenerContacto = async () => {
  try {
    const r = await pool.query(
      `SELECT CONFIG_CL, CONFIG_VA FROM TM_CONFIG WHERE CONFIG_CL IN ('contacto_direccion', 'contacto_telefono')`
    )
    const c = Object.fromEntries(r.rows.map(x => [x.config_cl, x.config_va]))
    return { direccion: c.contacto_direccion ?? '', telefono: c.contacto_telefono ?? '' }
  } catch {
    return { direccion: '', telefono: '' }
  }
}

const enlaceSeguimiento = () =>
  `${(process.env.WEB_PUBLICA_URL || 'https://misionnevadoweb.netlify.app').replace(/\/$/, '')}/#seguimiento`

// ─── Aviso general ────────────────────────────────────────────────────────────
// asunto: línea de asunto · etiqueta: chip superior · titulo: encabezado
// contenido: HTML armado con `bloques` (o función que recibe los datos de la institución)
// boton: { texto, url } (por defecto, seguimiento; url '' = sin botón)
// categoria: 'adopciones' | 'registros' | 'denuncias' → se respeta el interruptor de
//            "Configuración del Sistema". Sin categoría (seguridad) se envía siempre.
const enviarNotificacion = async ({ to_email, to_name, asunto, etiqueta, titulo, contenido, boton, categoria }) => {
  if (!to_email) return { enviado: false, motivo: 'Sin correo de destino' }
  const { avisos, institucion } = await obtenerConfigSistema()
  if (categoria && avisos[categoria] === false) {
    return { enviado: false, motivo: 'Avisos desactivados en Configuración del Sistema' }
  }
  const contacto = await obtenerContacto()
  const cuerpo = typeof contenido === 'function' ? contenido(institucion) : contenido
  const firma = institucion.firma ? bloques.parrafo(`<em>${escapar(institucion.firma)}</em>`) : ''
  return enviarCorreo(idPlantilla(), {
    to_email,
    to_name:     to_name || 'amigo(a) de Misión Nevado',
    asunto,
    etiqueta,
    titulo,
    contenido:   cuerpo + firma,
    boton_texto: boton?.texto ?? 'Consultar mi trámite',
    boton_url:   boton?.url ?? enlaceSeguimiento(),
    direccion:   contacto.direccion,
    telefono:    contacto.telefono,
    institucion: institucion.nombre,
    lema:        institucion.lema,
  })
}

// Versión "dispara y olvida": nunca bloquea ni rompe la respuesta al usuario
const notificarEnSegundoPlano = (datos) => {
  enviarNotificacion(datos).catch((e) => console.error('Aviso por correo falló:', e.message))
}

module.exports = { enviarCorreo, enviarNotificacion, notificarEnSegundoPlano, bloques, LOGO_MISION }
