// API de la app móvil del paciente (GUI-5 a GUI-7).
const express = require('express');
const { q, uno } = require('../db');
const { requiere } = require('./auth');
const Sesion = require('../dominio/Sesion');
const Alerta = require('../dominio/Alerta');
const Bitacora = require('../dominio/Bitacora');
const { Resultado } = require('../dominio/Instrumento');

const router = express.Router();
router.use(requiere('PACIENTE'));

const LINEAS_APOYO = [
  { nombre: 'Línea de la Vida (24 h, gratuita)', telefono: '8009112000' },
  { nombre: 'Emergencias', telefono: '911' },
];

async function estadoConsentimiento(idPaciente) {
  const c = await uno(`SELECT TOP 1 estado FROM consentimiento WHERE id_paciente = @p ORDER BY id_consentimiento DESC`, { p: idPaciente });
  return c ? c.estado : 'PENDIENTE';
}

/** CU-10 2A: el chat solo se abre con el consentimiento firmado. */
async function exigeConsentimiento(req, res, next) {
  if (await estadoConsentimiento(req.usuario.idPaciente) !== 'ACEPTADO') {
    return res.status(403).json({ error: 'Primero necesitas firmar el consentimiento informado.', codigo: 'CONSENTIMIENTO_PENDIENTE' });
  }
  next();
}

// GUI-5.2 Inicio de la app
router.get('/inicio', async (req, res) => {
  const p = req.usuario.idPaciente;
  const datos = await uno(`SELECT
      (SELECT COUNT(*) FROM evaluacion WHERE id_paciente = @p AND estado <> 'COMPLETADA') AS pendientes,
      (SELECT TOP 1 valor FROM registro_animo WHERE id_paciente = @p AND CAST(fecha_hora AS DATE) = CAST(GETDATE() AS DATE) ORDER BY fecha_hora DESC) AS animo_hoy,
      (SELECT COUNT(*) FROM notificacion n JOIN paciente pa ON pa.id_usuario = n.id_usuario WHERE pa.id_paciente = @p AND n.leida = 0) AS avisos`, { p });
  const siguiente = await uno(`SELECT TOP 1 e.id_evaluacion, i.siglas, i.nombre, e.fecha_limite FROM evaluacion e
      JOIN instrumento i ON i.id_instrumento = e.id_instrumento
      WHERE e.id_paciente = @p AND e.estado <> 'COMPLETADA' ORDER BY e.fecha_limite`, { p });
  res.json({
    nombre: req.usuario.nombre,
    consentimiento: await estadoConsentimiento(p),
    evaluacionesPendientes: datos.pendientes,
    animoHoy: datos.animo_hoy,
    avisosSinLeer: datos.avisos,
    siguienteEvaluacion: siguiente && { idEvaluacion: siguiente.id_evaluacion, siglas: siguiente.siglas, nombre: siguiente.nombre, fechaLimite: siguiente.fecha_limite },
  });
});

router.post('/animo', async (req, res) => {
  const valor = Number(req.body.valor);
  if (!(valor >= 1 && valor <= 5)) return res.status(400).json({ error: 'El ánimo va de 1 a 5.' });
  await q(`INSERT INTO registro_animo (id_paciente, valor) VALUES (@p, @v)`, { p: req.usuario.idPaciente, v: valor });
  res.json({ ok: true });
});

// GUI-5.1 / CU-09 Consentimiento informado
router.get('/consentimiento', async (req, res) => {
  const v = await uno(`SELECT TOP 1 id_version, version, texto_terminos FROM version_terminos ORDER BY fecha_publicacion DESC`);
  const c = await uno(`SELECT TOP 1 estado, fecha_firma FROM consentimiento WHERE id_paciente = @p ORDER BY id_consentimiento DESC`, { p: req.usuario.idPaciente });
  res.json({ version: v.version, texto: TEXTO_TERMINOS, estado: c ? c.estado : 'PENDIENTE', fechaFirma: c && c.fecha_firma });
});

router.post('/consentimiento', async (req, res) => {
  const acepta = req.body.acepta === true;
  const firma = String(req.body.firma || '').trim();
  const p = req.usuario.idPaciente;
  if (acepta && firma.length < 3) return res.status(400).json({ error: 'Escribe tu nombre completo como firma digital.' });
  const v = await uno(`SELECT TOP 1 id_version FROM version_terminos ORDER BY fecha_publicacion DESC`);
  const estado = acepta ? 'ACEPTADO' : 'RECHAZADO';
  const existe = await uno(`SELECT TOP 1 id_consentimiento FROM consentimiento WHERE id_paciente = @p ORDER BY id_consentimiento DESC`, { p });
  const params = { p, v: v.id_version, e: estado, f: acepta ? firma : null };
  if (existe) {
    await q(`UPDATE consentimiento SET id_version = @v, estado = @e,
               fecha_firma = CASE WHEN @e = 'ACEPTADO' THEN SYSDATETIME() ELSE NULL END,
               firma_digital = CASE WHEN @f IS NULL THEN NULL ELSE CAST(@f AS VARBINARY(MAX)) END
             WHERE id_consentimiento = @id`, { ...params, id: existe.id_consentimiento });
  } else {
    await q(`INSERT INTO consentimiento (id_paciente, id_version, estado, fecha_firma, firma_digital)
             VALUES (@p, @v, @e, CASE WHEN @e = 'ACEPTADO' THEN SYSDATETIME() END, CASE WHEN @f IS NULL THEN NULL ELSE CAST(@f AS VARBINARY(MAX)) END)`, params);
  }
  req.usuario.consentimiento = estado;
  await Bitacora.registrar('OPERACION', `Consentimiento ${estado.toLowerCase()} por el paciente`, req.usuario.idUsuario, req.ip);
  res.json({
    estado,
    mensaje: acepta
      ? 'Gracias. Tu consentimiento quedó firmado y se guardó una copia en tu expediente.'
      : 'Sin tu consentimiento no es posible iniciar el acompañamiento con SentIA. Puedes firmarlo cuando quieras.',
  });
});

// GUI-5.3 / CU-10 Chat con SentIA
router.get('/chat', exigeConsentimiento, async (req, res) => {
  const sesion = await Sesion.iniciarConversacion(req.usuario.idPaciente);
  const datos = await sesion.obtenerDatosSesion();
  res.json({ idSesion: sesion.id_sesion, mensajes: datos.mensajes });
});

// Secuencia 1: mensaje → analizarEmocion → evaluarNivelRiesgo → [≥ ALTO] generarAlerta → respuesta de contención
router.post('/chat', exigeConsentimiento, async (req, res) => {
  const texto = String(req.body.texto || '').trim();
  if (!texto) return res.status(400).json({ error: 'Escribe un mensaje.' });
  if (texto.length > 1000) return res.status(400).json({ error: 'El mensaje puede tener máximo 1000 caracteres.' });

  const idPaciente = req.usuario.idPaciente;
  const sesion = await Sesion.iniciarConversacion(idPaciente);
  await sesion.guardarMensaje('PACIENTE', texto);
  const emocion = await sesion.analizarEmocion(texto);
  const nivel = await sesion.evaluarNivelRiesgo();

  let alerta = null;
  if (nivel === 'ALTO' || nivel === 'CRITICO') {
    const ultimo = await Resultado.ultimoDelPaciente(idPaciente); // Alerta → Resultado.detectarRiesgo()
    const confirmado = ultimo && ultimo.detectarRiesgo();
    const nivelFinal = nivel === 'ALTO' && confirmado ? 'CRITICO' : nivel;
    alerta = await Alerta.generarAlerta({
      idPaciente, nivel: nivelFinal, origen: 'CONVERSACION', idSesion: sesion.id_sesion,
      motivo: `Emoción detectada: ${emocion}.` + (confirmado ? ` Último resultado ${ultimo.siglas} en rango de riesgo (${ultimo.categoria}).` : ''),
    });
  }

  const respuesta = Sesion.respuestaIA(emocion, alerta ? alerta.nivel : nivel);
  await sesion.guardarMensaje('SENTIA', respuesta);
  res.json({
    respuesta, emocion, nivelRiesgo: alerta ? alerta.nivel : nivel,
    alertaGenerada: !!alerta,
    lineasApoyo: alerta ? LINEAS_APOYO : [],
  });
});

// GUI-5.4 / CU-16 Solicitar apoyo de emergencia (la confirmación ocurre en la app)
router.post('/emergencia', async (req, res) => {
  const idPaciente = req.usuario.idPaciente;
  const sesion = await uno(`SELECT TOP 1 id_sesion FROM sesion WHERE id_paciente = @p AND estado = 'ACTIVA' ORDER BY fecha_inicio DESC`, { p: idPaciente });
  const alerta = await Alerta.generarAlerta({
    idPaciente, nivel: 'CRITICO', origen: 'BOTON_EMERGENCIA', idSesion: sesion && sesion.id_sesion,
    motivo: 'El paciente presionó el botón de emergencia.',
  });
  if (sesion) await q(`UPDATE sesion SET nivel_riesgo = 'CRITICO' WHERE id_sesion = @s`, { s: sesion.id_sesion });
  res.json({
    idAlerta: alerta.id,
    mensaje: 'Tu psicólogo ya recibió tu solicitud de apoyo y se comunicará contigo lo antes posible. Respira despacio; no estás solo(a).',
    lineasApoyo: LINEAS_APOYO,
  });
});

router.post('/emergencia/cancelada', async (req, res) => {
  await Bitacora.registrar('OPERACION', 'Solicitud de emergencia cancelada por el paciente', req.usuario.idUsuario, req.ip);
  res.json({ ok: true });
});

// GUI-6.1 Mis evaluaciones
router.get('/evaluaciones', async (req, res) => {
  const filas = await q(`SELECT e.id_evaluacion, i.siglas, i.nombre, e.estado, e.fecha_asignacion, e.fecha_limite, e.fecha_completada,
        e.mensaje_paciente,
        (SELECT COUNT(*) FROM respuesta r WHERE r.id_evaluacion = e.id_evaluacion) AS respondidas,
        (SELECT COUNT(*) FROM pregunta q WHERE q.id_instrumento = e.id_instrumento) AS total
      FROM evaluacion e JOIN instrumento i ON i.id_instrumento = e.id_instrumento
      WHERE e.id_paciente = @p
      ORDER BY CASE e.estado WHEN 'INICIADA' THEN 0 WHEN 'PENDIENTE' THEN 1 ELSE 2 END, e.fecha_limite`, { p: req.usuario.idPaciente });
  res.json(filas.map(f => ({
    idEvaluacion: f.id_evaluacion, siglas: f.siglas, nombre: f.nombre, estado: f.estado,
    fechaAsignacion: f.fecha_asignacion, fechaLimite: f.fecha_limite, fechaCompletada: f.fecha_completada,
    mensaje: f.mensaje_paciente, respondidas: f.respondidas, total: f.total,
  })));
});

async function evaluacionPropia(req, res) {
  const ev = await uno(`SELECT e.*, i.siglas, i.nombre FROM evaluacion e JOIN instrumento i ON i.id_instrumento = e.id_instrumento
                        WHERE e.id_evaluacion = @e AND e.id_paciente = @p`, { e: Number(req.params.id), p: req.usuario.idPaciente });
  if (!ev) res.status(404).json({ error: 'No encontramos esa evaluación.' });
  return ev;
}

// GUI-6.2 Responder instrumento: obtenerEstado() · cambiarEstado(INICIADA)
router.get('/evaluaciones/:id', async (req, res) => {
  const ev = await evaluacionPropia(req, res); if (!ev) return;
  if (ev.estado === 'COMPLETADA') return res.status(409).json({ error: 'Esta evaluación ya fue completada.' });
  if (ev.estado === 'PENDIENTE') await q(`UPDATE evaluacion SET estado = 'INICIADA' WHERE id_evaluacion = @e`, { e: ev.id_evaluacion });
  const preguntas = await q(`SELECT q.id_pregunta, q.numero, q.texto, q.tipo_respuesta, q.valor_minimo, q.valor_maximo, r.valor
      FROM pregunta q LEFT JOIN respuesta r ON r.id_pregunta = q.id_pregunta AND r.id_evaluacion = @e
      WHERE q.id_instrumento = @i ORDER BY q.numero`, { e: ev.id_evaluacion, i: ev.id_instrumento });
  res.json({
    idEvaluacion: ev.id_evaluacion, siglas: ev.siglas, nombre: ev.nombre, estado: 'INICIADA',
    preguntas: preguntas.map(p => ({
      idPregunta: p.id_pregunta, numero: p.numero, texto: p.texto, tipoRespuesta: p.tipo_respuesta,
      minimo: p.valor_minimo, maximo: p.valor_maximo, valor: p.valor, opciones: etiquetas(ev.siglas, p.tipo_respuesta, p.valor_minimo, p.valor_maximo),
    })),
  });
});

function etiquetas(siglas, tipo, min, max) {
  if (tipo === 'SI_NO') return ['No', 'Sí'];
  if (siglas === 'BAI') return ['En absoluto', 'Levemente', 'Moderadamente', 'Severamente'];
  if (max === 4) return ['Ausente', 'Leve', 'Moderado', 'Grave', 'Muy grave'];
  return Array.from({ length: max - min + 1 }, (_, k) => String(min + k));
}

// registrarValor(valor) — guarda en cada respuesta (CU-11 3A: progreso parcial)
router.put('/evaluaciones/:id/respuestas', async (req, res) => {
  const ev = await evaluacionPropia(req, res); if (!ev) return;
  if (ev.estado === 'COMPLETADA') return res.status(409).json({ error: 'Esta evaluación ya fue completada.' });
  const idPregunta = Number(req.body.idPregunta), valor = Number(req.body.valor);
  const preg = await uno(`SELECT * FROM pregunta WHERE id_pregunta = @q AND id_instrumento = @i`, { q: idPregunta, i: ev.id_instrumento });
  if (!preg) return res.status(400).json({ error: 'La pregunta no pertenece a este instrumento.' });
  if (!Number.isInteger(valor) || valor < preg.valor_minimo || valor > preg.valor_maximo) {
    return res.status(400).json({ error: 'El valor está fuera de la escala del instrumento.' });
  }
  await q(`MERGE respuesta AS t USING (SELECT @e AS id_evaluacion, @q AS id_pregunta) AS s
           ON t.id_evaluacion = s.id_evaluacion AND t.id_pregunta = s.id_pregunta
           WHEN MATCHED THEN UPDATE SET valor = @v, fecha_respuesta = SYSDATETIME()
           WHEN NOT MATCHED THEN INSERT (id_evaluacion, id_pregunta, valor) VALUES (@e, @q, @v);`,
    { e: ev.id_evaluacion, q: idPregunta, v: valor });
  if (ev.estado === 'PENDIENTE') await q(`UPDATE evaluacion SET estado = 'INICIADA' WHERE id_evaluacion = @e`, { e: ev.id_evaluacion });
  res.json({ ok: true });
});

// cambiarEstado(COMPLETADA) → CU-15 Procesar resultados → aviso al psicólogo (y alerta si hay riesgo)
router.post('/evaluaciones/:id/finalizar', async (req, res) => {
  const ev = await evaluacionPropia(req, res); if (!ev) return;
  if (ev.estado === 'COMPLETADA') return res.status(409).json({ error: 'Esta evaluación ya fue completada.' });
  const faltan = await uno(`SELECT COUNT(*) AS n FROM pregunta q WHERE q.id_instrumento = @i
      AND NOT EXISTS (SELECT 1 FROM respuesta r WHERE r.id_pregunta = q.id_pregunta AND r.id_evaluacion = @e)`, { i: ev.id_instrumento, e: ev.id_evaluacion });
  if (faltan.n > 0) return res.status(400).json({ error: `Te faltan ${faltan.n} preguntas por responder.` });

  const resultado = await Resultado.procesar(ev.id_evaluacion);
  const pac = await uno(`SELECT p.nombre + ' ' + p.apellidos AS nombre, ps.id_usuario FROM paciente p
                         JOIN psicologo ps ON ps.id_psicologo = p.id_psicologo WHERE p.id_paciente = @p`, { p: req.usuario.idPaciente });
  // crearAviso("RESULTADO", mensaje) · enviar()
  await q(`INSERT INTO notificacion (id_usuario, tipo, canal, mensaje) VALUES (@u, 'RESULTADO', 'PANTALLA', @m)`,
    { u: pac.id_usuario, m: `Resultado nuevo de ${pac.nombre} (${ev.siglas}).` });
  if (resultado.detectarRiesgo()) {
    await Alerta.generarAlerta({
      idPaciente: req.usuario.idPaciente, nivel: 'ALTO', origen: 'RESULTADO', idResultado: resultado.id,
      motivo: `${ev.siglas} en rango ${resultado.guia.categoria} (puntaje ${resultado.puntaje}).`,
    });
  }
  await Bitacora.registrar('OPERACION', `Evaluación #${ev.id_evaluacion} completada y procesada en ${resultado.ms} ms`, req.usuario.idUsuario, req.ip);
  res.json({
    idResultado: resultado.id, enRevision: true, ms: resultado.ms,
    mensaje: 'Gracias por completar tu evaluación. Tu psicólogo revisará tus resultados y pronto verás tu retroalimentación en «Mi progreso».',
  });
});

// GUI-7.1 / CU-12 Mi progreso: solo retroalimentación autorizada
router.get('/progreso', async (req, res) => {
  const filas = await q(`SELECT r.id_resultado, i.siglas, i.nombre, r.fecha_resultado, r.puntaje, g.categoria, g.recomendacion,
        r.retroalimentacion_autorizada AS autorizada
      FROM resultado r JOIN evaluacion e ON e.id_evaluacion = r.id_evaluacion
      JOIN instrumento i ON i.id_instrumento = e.id_instrumento JOIN guia_evaluacion g ON g.id_guia = r.id_guia
      WHERE e.id_paciente = @p ORDER BY r.fecha_resultado`, { p: req.usuario.idPaciente });
  const animo = await q(`SELECT TOP 14 CAST(fecha_hora AS DATE) AS fecha, AVG(CAST(valor AS FLOAT)) AS valor FROM registro_animo
      WHERE id_paciente = @p GROUP BY CAST(fecha_hora AS DATE) ORDER BY fecha DESC`, { p: req.usuario.idPaciente });
  res.json({
    resultados: filas.map(f => f.autorizada
      ? { idResultado: f.id_resultado, siglas: f.siglas, nombre: f.nombre, fecha: f.fecha_resultado, autorizado: true,
          puntaje: f.puntaje, categoria: f.categoria, mensaje: lenguajeSencillo(f.categoria), recomendacion: f.recomendacion }
      : { idResultado: f.id_resultado, siglas: f.siglas, nombre: f.nombre, fecha: f.fecha_resultado, autorizado: false,
          mensaje: 'Tu psicólogo está revisando este resultado. Te avisaremos cuando esté listo.' }),
    animo: animo.reverse().map(a => ({ fecha: a.fecha, valor: a.valor })),
    recomendacionDelDia: 'Dedica 5 minutos a respirar despacio y anota una cosa que salió bien hoy.',
  });
});

function lenguajeSencillo(categoria) {
  const c = (categoria || '').toLowerCase();
  if (c.includes('sever') || c.includes('alta')) return 'Tus respuestas muestran que estás pasando por un momento difícil. Lo trabajaremos juntos en tus sesiones.';
  if (c.includes('moder')) return 'Tus respuestas muestran algunas molestias que vale la pena atender. Vas por buen camino al registrarlas.';
  return 'Tus respuestas muestran pocas molestias. ¡Sigue con lo que te está funcionando!';
}

// Avisos (simula push; la app consulta cada 15 s)
router.get('/notificaciones', async (req, res) => {
  const filas = await q(`SELECT TOP 20 id_notificacion, tipo, mensaje, fecha_envio, leida FROM notificacion
      WHERE id_usuario = @u ORDER BY fecha_envio DESC`, { u: req.usuario.idUsuario });
  res.json(filas.map(f => ({ idNotificacion: f.id_notificacion, tipo: f.tipo, mensaje: f.mensaje, fecha: f.fecha_envio, leida: !!f.leida })));
});

router.post('/notificaciones/leer', async (req, res) => {
  await q(`UPDATE notificacion SET leida = 1 WHERE id_usuario = @u AND leida = 0`, { u: req.usuario.idUsuario });
  res.json({ ok: true });
});

const TEXTO_TERMINOS = `CONSENTIMIENTO INFORMADO Y AVISO DE PRIVACIDAD DE SentIA (versión 1.2)

1. ¿Qué es SentIA? Es una herramienta de apoyo que acompaña tu tratamiento psicológico entre sesiones. No sustituye a tu psicólogo ni es un servicio de emergencias.

2. Asistente con inteligencia artificial. SentIA conversa contigo y analiza tus mensajes para detectar señales de riesgo. Si detecta una situación de riesgo, avisará de inmediato a tu psicólogo.

3. Instrumentos clínicos. Tu psicólogo puede asignarte cuestionarios (BAI, HAM-A, TQ, TOP-8). Tus respuestas se califican automáticamente y solo tu psicólogo ve los resultados completos.

4. Confidencialidad. Tus datos de salud son datos personales sensibles y se tratan conforme a la Ley Federal de Protección de Datos Personales en Posesión de los Particulares (LFPDPPP). Solo tu psicólogo asignado puede consultar tu expediente.

5. Tus derechos. Puedes acceder, rectificar, cancelar u oponerte al uso de tus datos (derechos ARCO) y revocar este consentimiento en cualquier momento desde tu perfil.

6. Emergencias. Si estás en peligro inmediato llama al 911 o a la Línea de la Vida 800 911 2000.

Al firmar, declaro que leí y entendí este documento y acepto el tratamiento de mis datos para fines de mi atención psicológica.`;

module.exports = router;
