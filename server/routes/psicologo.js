// API del software de monitoreo del psicólogo (GUI-1 a GUI-4).
const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { q, uno, transaccion } = require('../db');
const { requiere } = require('./auth');
const Alerta = require('../dominio/Alerta');
const Bitacora = require('../dominio/Bitacora');

const router = express.Router();
router.use(requiere('PSICOLOGO'));

const MIN_INACTIVIDAD = Number(process.env.SENTIA_INACTIVIDAD_MIN || 30);
const NIVELES = ['BAJO', 'MEDIO', 'ALTO', 'CRITICO'];

// GUI-1.1 Indicadores del panel
router.get('/resumen', async (req, res) => {
  await Alerta.escalarPendientes();
  const ps = req.usuario.idPsicologo;
  const r = await uno(`SELECT
      (SELECT COUNT(*) FROM paciente WHERE id_psicologo = @ps AND activo = 1) AS pacientes,
      (SELECT COUNT(*) FROM alerta a JOIN paciente p ON p.id_paciente = a.id_paciente WHERE p.id_psicologo = @ps AND a.estado <> 'ATENDIDA') AS alertas,
      (SELECT COUNT(*) FROM sesion s JOIN paciente p ON p.id_paciente = s.id_paciente WHERE p.id_psicologo = @ps AND s.estado = 'ACTIVA') AS sesiones,
      (SELECT COUNT(*) FROM evaluacion WHERE id_psicologo = @ps AND estado <> 'COMPLETADA') AS pendientes,
      (SELECT COUNT(*) FROM evaluacion WHERE id_psicologo = @ps AND estado <> 'COMPLETADA' AND fecha_limite < CAST(GETDATE() AS DATE)) AS vencidas`, { ps });
  res.json(r);
});

// CU-03 Monitorear sesiones (vista S-03)
router.get('/sesiones', async (req, res) => {
  const filas = await q(`SELECT v.*, s.id_paciente, DATEDIFF(MINUTE, ISNULL(v.ultima_actividad, v.fecha_inicio), SYSDATETIME()) AS minutos_sin_actividad
      FROM vw_monitoreo_sesiones v JOIN sesion s ON s.id_sesion = v.id_sesion
      WHERE v.id_psicologo = @ps AND v.estado <> 'FINALIZADA'
      ORDER BY CASE v.nivel_riesgo WHEN 'CRITICO' THEN 1 WHEN 'ALTO' THEN 2 WHEN 'MEDIO' THEN 3 ELSE 4 END, v.ultima_actividad DESC`,
    { ps: req.usuario.idPsicologo });
  res.json(filas.map(f => ({ ...f, inactiva: f.minutos_sin_actividad >= MIN_INACTIVIDAD })));
});

// CU-07 Alertas sin atender (ALTO/CRÍTICO primero). El panel la consulta cada 3 s.
router.get('/alertas', async (req, res) => {
  await Alerta.escalarPendientes();
  const filas = await q(`SELECT a.id_notificacion AS id, a.id_paciente, p.nombre + ' ' + p.apellidos AS paciente, a.origen, a.nivel_riesgo,
        a.prioridad, a.estado, n.mensaje, n.fecha_envio, n.leida, s.emocion_detectada,
        DATEDIFF(SECOND, n.fecha_envio, SYSDATETIME()) AS segundos
      FROM alerta a JOIN notificacion n ON n.id_notificacion = a.id_notificacion
      JOIN paciente p ON p.id_paciente = a.id_paciente LEFT JOIN sesion s ON s.id_sesion = a.id_sesion
      WHERE p.id_psicologo = @ps AND a.estado <> 'ATENDIDA'
      ORDER BY a.prioridad, n.fecha_envio DESC`, { ps: req.usuario.idPsicologo });
  res.json(filas);
});

async function alertaPropia(req, res) {
  const a = await uno(`SELECT a.*, n.mensaje, n.fecha_envio, p.nombre + ' ' + p.apellidos AS paciente, p.telefono,
        p.contacto_emergencia_nombre, p.contacto_emergencia_telefono, p.id_psicologo, e.id_expediente, e.motivo_consulta, e.diagnostico
      FROM alerta a JOIN notificacion n ON n.id_notificacion = a.id_notificacion
      JOIN paciente p ON p.id_paciente = a.id_paciente LEFT JOIN expediente_clinico e ON e.id_paciente = p.id_paciente
      WHERE a.id_notificacion = @id`, { id: Number(req.params.id) });
  if (!a || a.id_psicologo !== req.usuario.idPsicologo) { res.status(404).json({ error: 'Alerta no encontrada.' }); return null; }
  return a;
}

// GUI-1.2 Detalle: marcarComoLeida() → LEIDA
router.get('/alertas/:id', async (req, res) => {
  const a = await alertaPropia(req, res); if (!a) return;
  await Alerta.marcarComoLeida(a.id_notificacion);
  const mensajes = a.id_sesion
    ? (await q(`SELECT TOP 12 emisor, texto, fecha_hora FROM mensaje WHERE id_sesion = @s ORDER BY fecha_hora DESC, id_mensaje DESC`, { s: a.id_sesion })).reverse()
    : [];
  const resultado = a.id_resultado
    ? await uno(`SELECT r.puntaje, g.categoria, i.siglas FROM resultado r JOIN guia_evaluacion g ON g.id_guia = r.id_guia
                 JOIN evaluacion e ON e.id_evaluacion = r.id_evaluacion JOIN instrumento i ON i.id_instrumento = e.id_instrumento
                 WHERE r.id_resultado = @r`, { r: a.id_resultado })
    : null;
  const actual = await uno(`SELECT estado FROM alerta WHERE id_notificacion = @id`, { id: a.id_notificacion });
  res.json({ ...a, estado: actual.estado, mensajes, resultado });
});

// atenderAlerta() → EN_ATENCION
router.post('/alertas/:id/atender', async (req, res) => {
  const a = await alertaPropia(req, res); if (!a) return;
  await Alerta.atenderAlerta(a.id_notificacion);
  res.json({ estado: 'EN_ATENCION' });
});

// Cierre con nota obligatoria → ATENDIDA
router.post('/alertas/:id/cerrar', async (req, res) => {
  const a = await alertaPropia(req, res); if (!a) return;
  const { accion, nota, nivelPosterior, seguimiento } = req.body;
  if (!accion || !String(accion).trim()) return res.status(400).json({ error: 'Indica la acción realizada.' });
  if (!nota || !String(nota).trim()) return res.status(400).json({ error: 'No se puede cerrar la alerta sin una nota de atención.' });
  if (!NIVELES.includes(nivelPosterior)) return res.status(400).json({ error: 'Selecciona el nivel de riesgo posterior.' });
  await Alerta.cerrar(a.id_notificacion, req.usuario.idPsicologo, { accion: String(accion), nota: String(nota).trim(), nivelPosterior, seguimiento });
  await Bitacora.registrar('OPERACION', `Atención de alerta #${a.id_notificacion} registrada`, req.usuario.idUsuario, req.ip);
  res.json({ estado: 'ATENDIDA' });
});

// Avisos de resultados nuevos para el psicólogo
router.get('/notificaciones', async (req, res) => {
  const filas = await q(`SELECT TOP 20 id_notificacion, tipo, mensaje, fecha_envio, leida FROM notificacion
      WHERE id_usuario = @u AND tipo <> 'ALERTA' ORDER BY fecha_envio DESC`, { u: req.usuario.idUsuario });
  res.json(filas);
});
router.post('/notificaciones/leer', async (req, res) => {
  await q(`UPDATE notificacion SET leida = 1 WHERE id_usuario = @u AND tipo <> 'ALERTA' AND leida = 0`, { u: req.usuario.idUsuario });
  res.json({ ok: true });
});

// GUI-2.1 Pacientes
router.get('/pacientes', async (req, res) => {
  const texto = `%${String(req.query.q || '').trim()}%`;
  const estado = req.query.estado; // activos | inactivos | todos
  const filas = await q(`SELECT p.id_paciente, p.nombre, p.apellidos, u.correo, p.telefono, p.fecha_registro, p.activo,
        DATEDIFF(YEAR, p.fecha_nacimiento, GETDATE()) AS edad,
        (SELECT TOP 1 estado FROM consentimiento c WHERE c.id_paciente = p.id_paciente ORDER BY id_consentimiento DESC) AS consentimiento,
        (SELECT TOP 1 nivel_riesgo FROM sesion s WHERE s.id_paciente = p.id_paciente ORDER BY fecha_inicio DESC) AS riesgo,
        (SELECT COUNT(*) FROM evaluacion e WHERE e.id_paciente = p.id_paciente AND e.estado <> 'COMPLETADA') AS pendientes
      FROM paciente p JOIN usuario u ON u.id_usuario = p.id_usuario
      WHERE p.id_psicologo = @ps AND (p.nombre + ' ' + p.apellidos LIKE @t OR u.correo LIKE @t)
        AND (@e = 'todos' OR (@e = 'inactivos' AND p.activo = 0) OR (@e <> 'inactivos' AND p.activo = 1))
      ORDER BY p.apellidos, p.nombre`, { ps: req.usuario.idPsicologo, t: texto, e: estado || 'activos' });
  res.json(filas);
});

// GUI-2.2 Registrar paciente (CU-01) con las validaciones de la tabla de interfaces
router.post('/pacientes', async (req, res) => {
  const b = req.body;
  const errores = {};
  const soloLetras = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ' ]+$/;
  if (!b.nombre || !soloLetras.test(b.nombre)) errores.nombre = 'Obligatorio, solo letras.';
  if (!b.apellidos || !soloLetras.test(b.apellidos)) errores.apellidos = 'Obligatorio, solo letras.';
  const nac = new Date(b.fechaNacimiento);
  const edad = (Date.now() - nac) / (365.25 * 864e5);
  if (!b.fechaNacimiento || isNaN(nac) || edad < 1 || edad > 120) errores.fechaNacimiento = 'La edad debe estar entre 1 y 120 años.';
  if (!['FEMENINO', 'MASCULINO', 'NO_BINARIO', 'NO_ESPECIFICA'].includes(b.genero)) errores.genero = 'Selecciona una opción.';
  if (!/^\d{10}$/.test(b.telefono || '')) errores.telefono = 'Debe tener 10 dígitos.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.correo || '')) errores.correo = 'Correo no válido.';
  if (b.contactoTelefono && !/^\d{10}$/.test(b.contactoTelefono)) errores.contactoTelefono = 'Debe tener 10 dígitos.';
  if (!b.motivo || !String(b.motivo).trim()) errores.motivo = 'Escribe el motivo de consulta.';
  const correo = String(b.correo || '').trim().toLowerCase();
  if (!errores.correo && await uno(`SELECT 1 AS x FROM usuario WHERE correo = @c`, { c: correo })) errores.correo = 'Ya existe una cuenta con ese correo.';
  if (Object.keys(errores).length) return res.status(400).json({ error: 'Revisa los campos marcados.', campos: errores });

  const codigo = 'SNT' + crypto.randomInt(1000, 9999);
  const id = await transaccion(async tx => {
    // Para la demo, la cuenta queda con la contraseña SentIA2026! (la activación GUI-0.4 queda fuera del prototipo).
    const u = await uno(`INSERT INTO usuario (correo, contrasena_hash, rol) OUTPUT INSERTED.id_usuario VALUES (@c, @h, 'PACIENTE')`,
      { c: correo, h: bcrypt.hashSync('SentIA2026!', 10) }, tx);
    await q(`INSERT INTO token_acceso (id_usuario, tipo, codigo, fecha_expira) VALUES (@u, 'INVITACION', @k, DATEADD(DAY, 7, SYSDATETIME()))`,
      { u: u.id_usuario, k: codigo }, tx);
    const p = await uno(`INSERT INTO paciente (id_usuario, id_psicologo, nombre, apellidos, fecha_nacimiento, genero, telefono,
                           contacto_emergencia_nombre, contacto_emergencia_telefono)
                         OUTPUT INSERTED.id_paciente VALUES (@u, @ps, @n, @a, @f, @g, @t, @cn, @ct)`,
      { u: u.id_usuario, ps: req.usuario.idPsicologo, n: b.nombre.trim(), a: b.apellidos.trim(), f: b.fechaNacimiento, g: b.genero,
        t: b.telefono, cn: b.contactoNombre || null, ct: b.contactoTelefono || null }, tx);
    await q(`INSERT INTO expediente_clinico (id_paciente, fecha_apertura, motivo_consulta, estado) VALUES (@p, CAST(GETDATE() AS DATE), @m, 'ABIERTO')`,
      { p: p.id_paciente, m: String(b.motivo).trim().slice(0, 500) }, tx);
    await q(`INSERT INTO consentimiento (id_paciente, id_version, estado)
             SELECT TOP 1 @p, id_version, 'PENDIENTE' FROM version_terminos ORDER BY fecha_publicacion DESC`, { p: p.id_paciente }, tx);
    return p.id_paciente;
  });
  await Bitacora.registrar('OPERACION', `Paciente #${id} registrado`, req.usuario.idUsuario, req.ip);
  res.status(201).json({ idPaciente: id, codigoInvitacion: codigo, mensaje: `Paciente registrado. Código de invitación: ${codigo}.` });
});

async function pacientePropio(req, res) {
  const p = await uno(`SELECT p.*, u.correo, DATEDIFF(YEAR, p.fecha_nacimiento, GETDATE()) AS edad FROM paciente p
                       JOIN usuario u ON u.id_usuario = p.id_usuario WHERE p.id_paciente = @p AND p.id_psicologo = @ps`,
    { p: Number(req.params.id), ps: req.usuario.idPsicologo });
  if (!p) res.status(404).json({ error: 'Paciente no encontrado.' });
  return p;
}

// GUI-2.3 Expediente clínico (CU-05, salida S-06)
router.get('/pacientes/:id', async (req, res) => {
  const p = await pacientePropio(req, res); if (!p) return;
  const expediente = await uno(`SELECT * FROM expediente_clinico WHERE id_paciente = @p`, { p: p.id_paciente });
  const consentimiento = await uno(`SELECT TOP 1 c.estado, c.fecha_firma, v.version FROM consentimiento c
      JOIN version_terminos v ON v.id_version = c.id_version WHERE c.id_paciente = @p ORDER BY c.id_consentimiento DESC`, { p: p.id_paciente });
  const notas = expediente ? await q(`SELECT n.fecha, n.tipo_nota, n.texto, ps.nombre + ' ' + ps.apellidos AS psicologo FROM nota_evolucion n
      JOIN psicologo ps ON ps.id_psicologo = n.id_psicologo WHERE n.id_expediente = @e ORDER BY n.fecha DESC`, { e: expediente.id_expediente }) : [];
  const resultados = await q(`SELECT * FROM vw_resultados_paciente WHERE id_paciente = @p ORDER BY fecha_aplicacion DESC`, { p: p.id_paciente });
  const evaluaciones = await q(`SELECT e.id_evaluacion, i.siglas, e.estado, e.fecha_asignacion, e.fecha_limite FROM evaluacion e
      JOIN instrumento i ON i.id_instrumento = e.id_instrumento WHERE e.id_paciente = @p AND e.estado <> 'COMPLETADA' ORDER BY e.fecha_limite`, { p: p.id_paciente });
  delete p.contrasena_hash;
  res.json({ paciente: p, expediente, consentimiento, notas, resultados, evaluaciones });
});

router.post('/pacientes/:id/notas', async (req, res) => {
  const p = await pacientePropio(req, res); if (!p) return;
  const { tipo, texto, diagnostico } = req.body;
  if (!['SESION', 'LLAMADA', 'SEGUIMIENTO'].includes(tipo)) return res.status(400).json({ error: 'Selecciona el tipo de nota.' });
  if (!texto || !String(texto).trim()) return res.status(400).json({ error: 'La nota clínica no puede estar vacía.' });
  const exp = await uno(`SELECT id_expediente, estado FROM expediente_clinico WHERE id_paciente = @p`, { p: p.id_paciente });
  if (exp.estado === 'CERRADO') return res.status(409).json({ error: 'El expediente está cerrado.' });
  await q(`INSERT INTO nota_evolucion (id_expediente, id_psicologo, fecha, tipo_nota, texto) VALUES (@e, @ps, SYSDATETIME(), @t, @x)`,
    { e: exp.id_expediente, ps: req.usuario.idPsicologo, t: tipo, x: String(texto).trim().slice(0, 2000) });
  if (diagnostico !== undefined && String(diagnostico).trim()) {
    await q(`UPDATE expediente_clinico SET diagnostico = @d WHERE id_expediente = @e`, { d: String(diagnostico).trim().slice(0, 500), e: exp.id_expediente });
  }
  await Bitacora.registrar('OPERACION', `Expediente #${exp.id_expediente} actualizado`, req.usuario.idUsuario, req.ip);
  res.status(201).json({ ok: true });
});

// GUI-3.1 Asignar instrumento (CU-02)
router.get('/instrumentos', async (req, res) => {
  res.json(await q(`SELECT i.id_instrumento, i.nombre, i.siglas, i.tipo, i.metodo_calificacion, i.version_autorizada,
      (SELECT COUNT(*) FROM pregunta q WHERE q.id_instrumento = i.id_instrumento) AS preguntas
      FROM instrumento i WHERE i.activo = 1 ORDER BY i.siglas`));
});

router.post('/evaluaciones', async (req, res) => {
  const { idPaciente, instrumentos, fechaLimite, recordatorioHoras, repetirCadaDias, mensaje } = req.body;
  if (!idPaciente || !Array.isArray(instrumentos) || !instrumentos.length) return res.status(400).json({ error: 'Selecciona un paciente y al menos un instrumento.' });
  const hoy = new Date().toISOString().slice(0, 10);
  if (!fechaLimite || fechaLimite <= hoy) return res.status(400).json({ error: 'La fecha límite debe ser posterior a hoy.' });
  const pac = await uno(`SELECT p.id_paciente, p.id_usuario FROM paciente p WHERE p.id_paciente = @p AND p.id_psicologo = @ps AND p.activo = 1`,
    { p: Number(idPaciente), ps: req.usuario.idPsicologo });
  if (!pac) return res.status(404).json({ error: 'Paciente no encontrado.' });
  const creadas = [];
  for (const idInst of instrumentos.map(Number)) {
    const inst = await uno(`SELECT siglas FROM instrumento WHERE id_instrumento = @i AND activo = 1`, { i: idInst });
    if (!inst) continue;
    const ev = await uno(`INSERT INTO evaluacion (id_paciente, id_instrumento, id_psicologo, fecha_limite, repetir_cada_dias, recordatorio_horas, mensaje_paciente, estado)
        OUTPUT INSERTED.id_evaluacion VALUES (@p, @i, @ps, @f, @r, @h, @m, 'PENDIENTE')`,
      { p: pac.id_paciente, i: idInst, ps: req.usuario.idPsicologo, f: fechaLimite, r: repetirCadaDias ? Number(repetirCadaDias) : null,
        h: recordatorioHoras ? Number(recordatorioHoras) : null, m: mensaje ? String(mensaje).slice(0, 300) : null });
    const [a, m, d] = fechaLimite.split('-');
    await q(`INSERT INTO notificacion (id_usuario, tipo, canal, mensaje) VALUES (@u, 'INSTRUMENTO', 'PUSH', @t)`,
      { u: pac.id_usuario, t: `Tu psicólogo te asignó el ${inst.siglas}. Fecha límite: ${d}/${m}/${a}.` });
    creadas.push(ev.id_evaluacion);
  }
  await Bitacora.registrar('OPERACION', `Asignación de ${creadas.length} instrumento(s) al paciente #${pac.id_paciente}`, req.usuario.idUsuario, req.ip);
  res.status(201).json({ evaluaciones: creadas });
});

// GUI-4.1 Resultados clínicos (CU-04)
router.get('/resultados', async (req, res) => {
  res.json(await q(`SELECT v.* FROM vw_resultados_paciente v JOIN paciente p ON p.id_paciente = v.id_paciente
      WHERE p.id_psicologo = @ps ORDER BY v.fecha_aplicacion DESC, v.id_resultado DESC`, { ps: req.usuario.idPsicologo }));
});

router.get('/resultados/:id', async (req, res) => {
  const r = await uno(`SELECT v.*, r.id_evaluacion, r.fecha_resultado, e.id_instrumento, i.nombre AS nombre_instrumento, i.metodo_calificacion,
        g.puntaje_min, g.puntaje_max, g.descripcion, g.indica_riesgo, p.genero, ex.id_expediente,
        ps.nombre + ' ' + ps.apellidos AS psicologo, ps.cedula_profesional
      FROM vw_resultados_paciente v JOIN resultado r ON r.id_resultado = v.id_resultado
      JOIN evaluacion e ON e.id_evaluacion = r.id_evaluacion JOIN instrumento i ON i.id_instrumento = e.id_instrumento
      JOIN guia_evaluacion g ON g.id_guia = r.id_guia JOIN paciente p ON p.id_paciente = v.id_paciente
      JOIN psicologo ps ON ps.id_psicologo = p.id_psicologo LEFT JOIN expediente_clinico ex ON ex.id_paciente = p.id_paciente
      WHERE v.id_resultado = @r AND p.id_psicologo = @ps`, { r: Number(req.params.id), ps: req.usuario.idPsicologo });
  if (!r) return res.status(404).json({ error: 'Resultado no encontrado.' });
  const respuestas = await q(`SELECT q.numero, q.texto, x.valor, q.valor_maximo FROM respuesta x JOIN pregunta q ON q.id_pregunta = x.id_pregunta
      WHERE x.id_evaluacion = @e ORDER BY q.numero`, { e: r.id_evaluacion });
  const evolucion = await q(`SELECT fecha_aplicacion, puntaje, categoria FROM vw_resultados_paciente
      WHERE id_paciente = @p AND instrumento = @i ORDER BY fecha_aplicacion`, { p: r.id_paciente, i: r.instrumento });
  const guia = await q(`SELECT puntaje_min, puntaje_max, categoria, indica_riesgo FROM guia_evaluacion WHERE id_instrumento = @i ORDER BY puntaje_min`, { i: r.id_instrumento });
  res.json({ ...r, respuestas, evolucion, guia });
});

router.post('/resultados/:id/autorizar', async (req, res) => {
  const r = await uno(`SELECT r.id_resultado, p.id_usuario, i.siglas FROM resultado r JOIN evaluacion e ON e.id_evaluacion = r.id_evaluacion
      JOIN paciente p ON p.id_paciente = e.id_paciente JOIN instrumento i ON i.id_instrumento = e.id_instrumento
      WHERE r.id_resultado = @r AND p.id_psicologo = @ps`, { r: Number(req.params.id), ps: req.usuario.idPsicologo });
  if (!r) return res.status(404).json({ error: 'Resultado no encontrado.' });
  await q(`UPDATE resultado SET retroalimentacion_autorizada = 1 WHERE id_resultado = @r`, { r: r.id_resultado });
  await q(`INSERT INTO notificacion (id_usuario, tipo, canal, mensaje) VALUES (@u, 'RESULTADO', 'PUSH', @m)`,
    { u: r.id_usuario, m: `Tu retroalimentación del ${r.siglas} ya está lista. Revísala en «Mi progreso».` });
  await Bitacora.registrar('OPERACION', `Retroalimentación del resultado #${r.id_resultado} autorizada`, req.usuario.idUsuario, req.ip);
  res.json({ ok: true });
});

// Reportes S-08 y S-09 (vistas del entregable 13)
router.get('/reportes/pendientes', async (req, res) => {
  res.json(await q(`SELECT * FROM vw_evaluaciones_pendientes WHERE id_psicologo = @ps ORDER BY fecha_limite`, { ps: req.usuario.idPsicologo }));
});
router.get('/reportes/alertas', async (req, res) => {
  res.json(await q(`SELECT * FROM vw_estadistica_alertas ORDER BY nivel_riesgo, origen`));
});

// Bitácora (para mostrar la trazabilidad en la demo)
router.get('/bitacora', async (req, res) => {
  res.json(await q(`SELECT TOP 40 b.id_bitacora, b.tipo_evento, b.detalle, b.fecha_hora, b.ip_origen, u.correo, u.rol
      FROM bitacora b LEFT JOIN usuario u ON u.id_usuario = b.id_usuario ORDER BY b.fecha_hora DESC, b.id_bitacora DESC`));
});

module.exports = router;
