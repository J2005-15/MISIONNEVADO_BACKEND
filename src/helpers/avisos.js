// Textos de los avisos por correo. Todos usan la misma plantilla de EmailJS
// (ver helpers/correo.js); aquí solo cambia el contenido de cada caso.
const { enviarNotificacion, notificarEnSegundoPlano, bloques: b, LOGO_MISION } = require('./correo')

// Foto del animal en versión liviana (o el logo si no tiene)
const fotoCorreo = (url) =>
  /^https?:\/\//.test(url ?? '') && url.includes('/upload/')
    ? url.replace('/upload/', '/upload/w_600,h_400,c_pad,b_auto,f_auto,q_auto/')
    : LOGO_MISION

// ─── ADOPCIONES ───────────────────────────────────────────────────────────────
// Se espera (await) para poder informar en la respuesta si el correo salió.
const solicitudAdopcionRecibida = ({ email, nombre, mascota, foto }) => enviarNotificacion({
  to_email: email, to_name: nombre,
  categoria: 'adopciones',
  asunto:   `Recibimos tu solicitud para adoptar a ${mascota} 🐾`,
  etiqueta: 'Solicitud recibida',
  titulo:   `¡Hola, ${nombre}!`,
  contenido:
    b.parrafo(`Gracias por querer darle un hogar a ${b.destacado(mascota)}. Hemos recibido tu solicitud de adopción y ya está en proceso.`) +
    b.foto(fotoCorreo(foto), mascota, 'En proceso de adopción') +
    b.pasos('¿Qué sigue ahora?', [
      '<strong style="color:#212529;">Te llamaremos</strong> pronto para coordinar tu visita.',
      `Te dirigirás al lugar donde se encuentra <strong style="color:#212529;">${b.texto(mascota)}</strong> para conocerlo en persona.`,
      'Realizarás nuestra <strong style="color:#212529;">capacitación de adopción responsable</strong>.',
      'Evaluaremos si eres apto para adoptarlo y <strong style="color:#212529;">te informaremos el resultado</strong>.',
    ]),
})

const adopcionAprobada = ({ email, nombre, mascota, foto }) => notificarEnSegundoPlano({
  to_email: email, to_name: nombre,
  categoria: 'adopciones',
  asunto:   `¡Tu adopción de ${mascota} fue aprobada! 🎉`,
  etiqueta: 'Adopción aprobada',
  titulo:   `¡Felicidades, ${nombre}!`,
  contenido:
    b.parrafo(`Completaste el proceso y fuiste aprobado para adoptar a ${b.destacado(mascota)}. ¡Gracias por darle una segunda oportunidad!`) +
    b.foto(fotoCorreo(foto), mascota, 'Adoptado') +
    b.estado('Tu adopción quedó registrada en el Censo Animal de la misión.', 'verde') +
    b.parrafo('Nos comunicaremos contigo para acordar la entrega. Si tienes cualquier duda sobre sus cuidados, estamos para ayudarte.'),
})

const adopcionNoAprobada = ({ email, nombre, mascota }) => notificarEnSegundoPlano({
  to_email: email, to_name: nombre,
  categoria: 'adopciones',
  asunto:   `Resultado de tu solicitud para adoptar a ${mascota}`,
  etiqueta: 'Solicitud revisada',
  titulo:   `Hola, ${nombre}`,
  contenido:
    b.parrafo(`Revisamos con cuidado tu solicitud para adoptar a ${b.destacado(mascota)} y en esta ocasión no pudimos aprobarla.`) +
    b.estado('Solicitud no aprobada', 'gris') +
    b.parrafo('Te agradecemos mucho tu interés. Hay otros animales esperando un hogar: te invitamos a conocerlos en nuestra cartelera de adopción.'),
  boton: { texto: 'Ver animales en adopción', url: `${(process.env.WEB_PUBLICA_URL || 'https://misionnevadoweb.netlify.app').replace(/\/$/, '')}/#adopciones` },
})

const adoptadoPorOtraFamilia = ({ email, nombre, mascota }) => notificarEnSegundoPlano({
  to_email: email, to_name: nombre,
  categoria: 'adopciones',
  asunto:   `${mascota} ya encontró un hogar`,
  etiqueta: 'Solicitud cerrada',
  titulo:   `Hola, ${nombre}`,
  contenido:
    b.parrafo(`Te contamos que ${b.destacado(mascota)} ya fue adoptado por otra familia, por lo que tu solicitud quedó cerrada.`) +
    b.parrafo('¡Gracias por querer ayudar! Hay más animales esperando una oportunidad como la que querías darle.'),
  boton: { texto: 'Ver animales en adopción', url: `${(process.env.WEB_PUBLICA_URL || 'https://misionnevadoweb.netlify.app').replace(/\/$/, '')}/#adopciones` },
})

// ─── VOLUNTARIOS Y PROTECCIONISTAS ───────────────────────────────────────────
const NOMBRE_REGISTRO = { voluntario: 'voluntario', proteccionista: 'proteccionista' }

const registroRecibido = (tipo, { email, nombre }) => notificarEnSegundoPlano({
  to_email: email, to_name: nombre,
  categoria: 'registros',
  asunto:   `Recibimos tu registro como ${NOMBRE_REGISTRO[tipo]} 🐾`,
  etiqueta: 'Registro recibido',
  titulo:   `¡Gracias, ${nombre}!`,
  contenido: (institucion) =>
    b.parrafo(`Recibimos tu postulación como ${b.destacado(NOMBRE_REGISTRO[tipo])} de la ${b.texto(institucion.nombre)}.`) +
    b.estado('Estado: en espera de aprobación', 'dorado') +
    b.pasos('¿Qué sigue ahora?', [
      'Nuestro equipo <strong style="color:#212529;">revisará tus datos</strong>.',
      'Podemos <strong style="color:#212529;">contactarte</strong> por teléfono para conocerte mejor.',
      'Te avisaremos por este medio cuando tu registro sea <strong style="color:#212529;">aprobado</strong>.',
    ]),
})

const registroAprobado = (tipo, { email, nombre }) => notificarEnSegundoPlano({
  to_email: email, to_name: nombre,
  categoria: 'registros',
  asunto:   `¡Ya eres ${NOMBRE_REGISTRO[tipo]} de Misión Nevado! 🎉`,
  etiqueta: 'Registro aprobado',
  titulo:   `¡Bienvenido(a), ${nombre}!`,
  contenido:
    b.parrafo(`Tu registro como ${b.destacado(NOMBRE_REGISTRO[tipo])} fue aprobado. ¡Gracias por sumarte a proteger la vida animal!`) +
    b.estado('Estado: aprobado', 'verde') +
    b.parrafo('Te contactaremos para las próximas actividades y jornadas en las que puedes participar.'),
})

// ─── DENUNCIAS ────────────────────────────────────────────────────────────────
const ESTADO_DENUNCIA = {
  ABIERTA:     ['Recibida — pendiente de revisión', 'dorado'],
  EN_PROCESO:  ['En proceso — nuestro equipo está atendiendo el caso', 'dorado'],
  CERRADA:     ['Atendida — el caso fue cerrado', 'verde'],
  DESESTIMADA: ['Desestimada — el caso no procede', 'gris'],
}

const denunciaRecibida = ({ email, numero, sector }) => notificarEnSegundoPlano({
  to_email: email,
  categoria: 'denuncias',
  asunto:   `Recibimos tu denuncia #${numero}`,
  etiqueta: 'Denuncia recibida',
  titulo:   'Gracias por alzar la voz por los animales',
  contenido:
    b.parrafo(`Registramos tu denuncia ${b.destacado(`#${numero}`)}${sector ? ` en ${b.destacado(sector)}` : ''}. Nuestro equipo la revisará lo antes posible.`) +
    b.estado(ESTADO_DENUNCIA.EN_PROCESO[0], 'dorado') +
    b.parrafo('Te avisaremos por este medio cuando cambie su estado.'),
})

const denunciaActualizada = ({ email, numero, estado }) => {
  const [texto, tono] = ESTADO_DENUNCIA[estado] ?? [estado, 'gris']
  return notificarEnSegundoPlano({
    to_email: email,
    categoria: 'denuncias',
    asunto:   `Tu denuncia #${numero} cambió de estado`,
    etiqueta: 'Actualización de denuncia',
    titulo:   `Novedades de tu denuncia #${numero}`,
    contenido:
      b.parrafo('El estado de tu denuncia se actualizó:') +
      b.estado(texto, tono) +
      b.parrafo('Gracias por ayudarnos a proteger a los animales del Municipio Jáuregui.'),
  })
}

// ─── SEGURIDAD DEL PANEL ─────────────────────────────────────────────────────
// Sin categoría: se envían siempre, aunque los demás avisos estén desactivados.
const codigoRecuperacion = ({ email, nombre, codigo, minutos }) => enviarNotificacion({
  to_email: email, to_name: nombre,
  asunto:   `Tu código para restablecer la contraseña: ${codigo}`,
  etiqueta: 'Recuperación de contraseña',
  titulo:   `Hola, ${nombre}`,
  contenido:
    b.parrafo('Recibimos una solicitud para restablecer la contraseña de tu cuenta del panel administrativo. Tu código es:') +
    `<p style="margin:6px 0 18px 0; padding:16px; border-radius:14px; background-color:#FFEFD1; text-align:center; font-size:32px; font-weight:800; letter-spacing:10px; color:#212529;">${b.texto(codigo)}</p>` +
    b.estado(`Vence en ${minutos} minutos y solo puede usarse una vez.`, 'dorado') +
    b.parrafo('Si no fuiste tú, ignora este correo: tu contraseña actual sigue funcionando y nadie puede cambiarla sin este código.'),
  boton: { texto: '', url: '' },
})

const claveRestablecida = ({ email, nombre }) => notificarEnSegundoPlano({
  to_email: email, to_name: nombre,
  asunto:   'Tu contraseña del panel fue cambiada',
  etiqueta: 'Aviso de seguridad',
  titulo:   `Hola, ${nombre}`,
  contenido:
    b.parrafo('Te confirmamos que la contraseña de tu cuenta del panel administrativo se restableció correctamente con un código enviado a este correo.') +
    b.estado('Contraseña actualizada', 'verde') +
    b.parrafo('Si no fuiste tú, comunícate de inmediato con el administrador del sistema.'),
  boton: { texto: '', url: '' },
})

module.exports = {
  solicitudAdopcionRecibida, adopcionAprobada, adopcionNoAprobada, adoptadoPorOtraFamilia,
  registroRecibido, registroAprobado,
  denunciaRecibida, denunciaActualizada,
  codigoRecuperacion, claveRestablecida,
}
