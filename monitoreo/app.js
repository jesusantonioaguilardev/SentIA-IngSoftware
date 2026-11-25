// SentIA · Software de monitoreo del psicólogo (prototipo). JavaScript sin framework.
'use strict';

const API = '/api';
const $ = s => document.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const NIVEL_TXT = { CRITICO: 'Crítico', ALTO: 'Alto', MEDIO: 'Medio', BAJO: 'Bajo' };
// Íconos de línea en SVG (sin emojis)
const svg = (trazos, clase = 'ico') => `<svg class="${clase}" viewBox="0 0 24 24" aria-hidden="true">${trazos}</svg>`;
const ICONO = {
  alerta: (c) => svg('<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>', c),
  atras: () => svg('<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>'),
  descargar: () => svg('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>'),
  check: () => svg('<path d="M20 6 9 17l-5-5"/>'),
  telefono: () => svg('<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>'),
};
const ORIGEN_TXT = { CONVERSACION: 'Conversación con SentIA', RESULTADO: 'Resultado de instrumento', BOTON_EMERGENCIA: 'Botón de emergencia' };
const nivel = n => n ? `<span class="nivel ${esc(n)}">${esc(NIVEL_TXT[n] || n)}</span>` : '—';
const estado = e => e ? `<span class="estado ${esc(e)}">${esc(String(e).replace('_', ' '))}</span>` : '—';
const fecha = f => f ? esc(String(f).split('-').length === 3 && String(f).length === 10 ? String(f).split('-').reverse().join('/') : String(f).replace(/^(\d{4})-(\d{2})-(\d{2})/, '$3/$2/$1')) : '—';

let sesion = null;
try { sesion = JSON.parse(sessionStorage.getItem('sentia') || 'null'); } catch { sesion = null; }
let alertasVistas = new Set();
let primeraCarga = true;
let temporizador = null;

async function api(metodo, ruta, cuerpo) {
  const r = await fetch(API + ruta, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...(sesion ? { Authorization: 'Bearer ' + sesion.token } : {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const datos = await r.json().catch(() => ({}));
  if (r.status === 401 && sesion) { salir(); throw new Error(datos.error); }
  if (!r.ok) throw Object.assign(new Error(datos.error || 'Error'), { datos });
  return datos;
}

function toast(texto, clase = '') {
  const t = $('#toast');
  t.textContent = texto; t.className = 'toast ' + clase; t.hidden = false;
  clearTimeout(t._t); t._t = setTimeout(() => { t.hidden = true; }, 4500);
}

// ---------- GUI-0.1 Login ----------
$('#form-login').addEventListener('submit', async e => {
  e.preventDefault();
  const correo = $('#login-correo').value.trim(), contrasena = $('#login-contrasena').value;
  $('#login-error').textContent = '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) return $('#login-error').textContent = 'Escribe un correo con formato usuario@dominio.';
  if (contrasena.length < 8) return $('#login-error').textContent = 'La contraseña tiene mínimo 8 caracteres.';
  try {
    sesion = await api('POST', '/auth/login', { correo, contrasena, cliente: 'monitoreo' });
    sessionStorage.setItem('sentia', JSON.stringify(sesion));
    iniciar();
  } catch (err) { $('#login-error').textContent = err.message; }
});

function salir() {
  if (sesion) fetch(API + '/auth/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + sesion.token } }).catch(() => {});
  sesion = null; sessionStorage.removeItem('sentia'); clearInterval(temporizador);
  $('#vista-app').hidden = true; $('#vista-login').hidden = false; $('#login-contrasena').value = '';
}
$('#btn-salir').addEventListener('click', salir);

function iniciar() {
  $('#vista-login').hidden = true; $('#vista-app').hidden = false;
  $('#nombre-usuario').textContent = 'Psic. ' + sesion.nombre;
  primeraCarga = true; alertasVistas = new Set();
  vigilar(); clearInterval(temporizador); temporizador = setInterval(vigilar, 3000);
  if (!location.hash) location.hash = '#/panel'; else enrutar();
}

// ---------- Tiempo real: alertas cada 3 s (S-01 < 5 s) ----------
async function vigilar() {
  try {
    const [alertas, avisos] = await Promise.all([api('GET', '/psicologo/alertas'), api('GET', '/psicologo/notificaciones')]);
    const b = $('#badge-alertas'); b.textContent = alertas.length; b.hidden = !alertas.length;
    const noLeidos = avisos.filter(a => !a.leida && a.tipo === 'RESULTADO');
    const br = $('#badge-resultados'); br.textContent = noLeidos.length; br.hidden = !noLeidos.length;
    const nuevas = alertas.filter(a => !alertasVistas.has(a.id));
    alertas.forEach(a => alertasVistas.add(a.id));
    if (!primeraCarga) {
      const urgente = nuevas.find(a => a.nivel_riesgo === 'CRITICO' || a.nivel_riesgo === 'ALTO');
      if (urgente && $('#modal').hidden) { sonar(); abrirAlerta(urgente.id); }
      const nuevosRes = noLeidos.filter(a => !vigilar.vistos?.has(a.id_notificacion));
      if (nuevosRes.length) toast(nuevosRes[0].mensaje, 'naranja');
    }
    vigilar.vistos = new Set(noLeidos.map(a => a.id_notificacion));
    primeraCarga = false;
    if (rutaActual() === 'panel' && $('#modal').hidden) pintarPanel(alertas);
  } catch { /* el siguiente ciclo reintenta */ }
}

function sonar() { // aviso sonoro sin archivos externos
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, .35, .7].forEach(t => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = 880; o.type = 'square'; g.gain.value = .08;
      o.connect(g); g.connect(ctx.destination); o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + .2);
    });
  } catch { /* sin audio */ }
}

// ---------- Enrutador ----------
const rutaActual = () => (location.hash.replace('#/', '').split('/')[0] || 'panel');
window.addEventListener('hashchange', enrutar);
const TITULOS = { panel: 'Panel de monitoreo', pacientes: 'Pacientes', paciente: 'Expediente clínico', asignar: 'Asignar instrumento',
  resultados: 'Resultados clínicos', resultado: 'Resultado clínico', reportes: 'Reportes', bitacora: 'Bitácora de actividad' };

async function enrutar() {
  if (!sesion) return;
  const [ruta, id] = location.hash.replace('#/', '').split('/');
  document.querySelectorAll('.menu nav a').forEach(a => a.classList.toggle('activo', a.dataset.ruta === ruta || (ruta === 'paciente' && a.dataset.ruta === 'pacientes') || (ruta === 'resultado' && a.dataset.ruta === 'resultados')));
  $('#titulo').textContent = TITULOS[ruta] || 'SentIA';
  const c = $('#contenido');
  c.innerHTML = '<p class="vacio">Cargando…</p>';
  try {
    if (ruta === 'panel') await vistaPanel();
    else if (ruta === 'pacientes') await vistaPacientes();
    else if (ruta === 'paciente') await vistaExpediente(id);
    else if (ruta === 'asignar') await vistaAsignar(id);
    else if (ruta === 'resultados') await vistaResultados();
    else if (ruta === 'resultado') await vistaResultado(id);
    else if (ruta === 'reportes') await vistaReportes();
    else if (ruta === 'bitacora') await vistaBitacora();
    else location.hash = '#/panel';
  } catch (e) { c.innerHTML = `<p class="error">${esc(e.message)}</p>`; }
}

// ---------- GUI-1.1 Panel de monitoreo (S-03) ----------
async function vistaPanel() {
  $('#contenido').innerHTML = `
    <div class="kpis" id="kpis"></div>
    <div class="dos-col">
      <section class="tarjeta"><h2>Alertas sin atender</h2><div id="lista-alertas" class="alertas"></div></section>
      <section class="tarjeta"><h2>Sesiones con SentIA</h2><div id="lista-sesiones"></div></section>
    </div>`;
  pintarPanel(await api('GET', '/psicologo/alertas'));
}

async function pintarPanel(alertas) {
  const [r, sesiones] = await Promise.all([api('GET', '/psicologo/resumen'), api('GET', '/psicologo/sesiones')]);
  if (rutaActual() !== 'panel' || !$('#kpis')) return;
  $('#kpis').innerHTML = `
    <div class="kpi rojo"><b>${r.alertas}</b><span>Alertas sin atender</span></div>
    <div class="kpi morado"><b>${r.sesiones}</b><span>Sesiones activas</span></div>
    <div class="kpi"><b>${r.pacientes}</b><span>Pacientes activos</span></div>
    <div class="kpi naranja"><b>${r.pendientes}</b><span>Evaluaciones pendientes (${r.vencidas} vencidas)</span></div>`;
  $('#lista-alertas').innerHTML = alertas.length ? alertas.map(a => `
    <div class="alerta-item ${esc(a.nivel_riesgo)}" data-alerta="${a.id}">
      ${nivel(a.nivel_riesgo)}
      <div><b>${esc(a.paciente)}</b><br><small>${esc(ORIGEN_TXT[a.origen])} · ${fecha(a.fecha_envio)} · ${esc(hace(a.segundos))}</small></div>
      ${estado(a.estado)}
    </div>`).join('') : '<p class="vacio">No hay alertas pendientes.</p>';
  $('#lista-alertas').querySelectorAll('[data-alerta]').forEach(el => el.onclick = () => abrirAlerta(el.dataset.alerta));
  $('#lista-sesiones').innerHTML = sesiones.length ? `<table><thead><tr><th>Paciente</th><th>Riesgo</th><th>Emoción</th><th>Última actividad</th></tr></thead><tbody>
    ${sesiones.map(s => `<tr class="clic ${s.inactiva ? 'inactiva' : ''}" data-pac="${s.id_paciente}">
      <td>${esc(s.paciente)}${s.inactiva ? '<br><small>Sin actividad ' + esc(hace(s.minutos_sin_actividad * 60)) + '</small>' : ''}</td>
      <td>${nivel(s.nivel_riesgo)}</td><td>${esc(s.emocion_detectada || '—')}</td><td>${fecha(s.ultima_actividad || s.fecha_inicio)}</td></tr>`).join('')}
    </tbody></table>` : '<p class="vacio">No hay sesiones activas.</p>';
  $('#lista-sesiones').querySelectorAll('[data-pac]').forEach(el => el.onclick = () => location.hash = '#/paciente/' + el.dataset.pac);
}

function hace(seg) {
  seg = Number(seg) || 0;
  if (seg < 60) return 'hace unos segundos';
  if (seg < 3600) return `hace ${Math.round(seg / 60)} min`;
  if (seg < 86400) return `hace ${Math.round(seg / 3600)} h`;
  return `hace ${Math.round(seg / 86400)} días`;
}

// ---------- S-01 Alerta de peligro + GUI-1.2 Atender alerta ----------
async function abrirAlerta(id) {
  const a = await api('GET', '/psicologo/alertas/' + id); // marcarComoLeida()
  const m = $('#modal'), cuerpo = $('#modal-cuerpo');
  cuerpo.innerHTML = `
    <div class="modal-cab ${a.nivel_riesgo === 'CRITICO' || a.nivel_riesgo === 'ALTO' ? 'peligro pulso' : ''}">
      <h2 id="modal-titulo" class="con-ico" style="margin:0; gap:10px">${ICONO.alerta('ico grande')} Alerta de peligro · ${esc(NIVEL_TXT[a.nivel_riesgo])}</h2>
      <button class="btn texto" data-cerrar>Cerrar</button>
    </div>
    <div class="modal-cuerpo">
      <div class="datos">
        <div><span>Paciente</span><b>${esc(a.paciente)}</b></div>
        <div><span>Expediente</span>#${esc(a.id_expediente)}</div>
        <div><span>Nivel de riesgo</span>${nivel(a.nivel_riesgo)}</div>
        <div><span>Estado</span><span id="estado-alerta">${estado(a.estado)}</span></div>
        <div><span>Origen</span>${esc(ORIGEN_TXT[a.origen])}</div>
        <div><span>Fecha y hora</span>${fecha(a.fecha_envio)}</div>
        <div><span>Teléfono del paciente</span>${esc(a.telefono)}</div>
        <div><span>Contacto de emergencia</span>${esc(a.contacto_emergencia_nombre || 'No registrado')} ${esc(a.contacto_emergencia_telefono || '')}</div>
      </div>
      <p style="margin:0"><b>Motivo:</b> ${esc(a.mensaje)}</p>
      ${a.resultado ? `<p style="margin:0"><b>Resultado:</b> ${esc(a.resultado.siglas)} · puntaje ${esc(a.resultado.puntaje)} (${esc(a.resultado.categoria)})</p>` : ''}
      ${a.mensajes.length ? `<div><h3>Conversación reciente</h3><div class="chat-mini">${a.mensajes.map(x => `<div class="burbuja ${esc(x.emisor)}">${esc(x.texto)}</div>`).join('')}</div></div>` : ''}
      <div id="zona-atencion">
        ${a.estado === 'EN_ATENCION' ? '' : `<button class="btn peligro ancho con-ico" style="justify-content:center" id="btn-atender">${ICONO.telefono()} Atender alerta</button>`}
      </div>
    </div>`;
  m.hidden = false;
  cuerpo.querySelector('[data-cerrar]').onclick = cerrarModal;
  const formAtencion = () => {
    $('#zona-atencion').innerHTML = `
      <form id="form-atencion" class="form-grid" novalidate>
        <h3 class="completo">Registrar atención (GUI-1.2)</h3>
        <label>Acción realizada <span class="req">*</span>
          <select id="at-accion"><option>Llamada telefónica al paciente</option><option>Videollamada</option><option>Contacto con familiar</option><option>Canalización a urgencias</option><option>Mensaje de seguimiento</option></select></label>
        <label>Nivel de riesgo posterior <span class="req">*</span>
          <select id="at-nivel"><option value="">Selecciona…</option><option value="BAJO">Bajo</option><option value="MEDIO">Medio</option><option value="ALTO">Alto</option><option value="CRITICO">Crítico</option></select></label>
        <label class="completo">Nota de atención <span class="req">*</span><textarea id="at-nota" rows="3" maxlength="500" placeholder="Describe cómo se atendió la situación"></textarea>
          <span class="msg-campo" id="at-error"></span></label>
        <label class="check completo"><input type="checkbox" id="at-seg" checked> Requiere seguimiento</label>
        <div class="acciones completo"><button type="button" class="btn secundario" data-cerrar>Cancelar</button><button class="btn primario">Marcar como atendida</button></div>
      </form>`;
    $('#form-atencion [data-cerrar]').onclick = cerrarModal;
    $('#form-atencion').onsubmit = async e => {
      e.preventDefault();
      const nota = $('#at-nota').value.trim(), nivelPost = $('#at-nivel').value;
      $('#at-nota').classList.toggle('invalido', !nota); $('#at-nivel').classList.toggle('invalido', !nivelPost);
      if (!nota) return $('#at-error').textContent = 'No se puede marcar como atendida sin registrar una nota.';
      if (!nivelPost) return $('#at-error').textContent = 'Selecciona el nivel de riesgo posterior.';
      try {
        await api('POST', `/psicologo/alertas/${id}/cerrar`, { accion: $('#at-accion').value, nota, nivelPosterior: nivelPost, seguimiento: $('#at-seg').checked });
        cerrarModal(); toast('Alerta atendida y nota agregada al expediente.'); vigilar();
      } catch (err) { $('#at-error').textContent = err.message; }
    };
  };
  if (a.estado === 'EN_ATENCION') formAtencion();
  else $('#btn-atender').onclick = async () => {
    await api('POST', `/psicologo/alertas/${id}/atender`); // atenderAlerta() → EN_ATENCION
    $('#estado-alerta').innerHTML = estado('EN_ATENCION');
    cuerpo.querySelector('.modal-cab').classList.remove('pulso');
    formAtencion();
  };
}
function cerrarModal() { $('#modal').hidden = true; if (rutaActual() === 'panel') vigilar(); }
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') cerrarModal(); });

// ---------- GUI-2.1 Pacientes / GUI-2.2 Registrar ----------
async function vistaPacientes() {
  $('#contenido').innerHTML = `
    <section class="tarjeta">
      <div class="fila entre" style="margin-bottom:14px">
        <div class="fila"><input id="buscar" placeholder="Buscar por nombre o correo" style="width:260px">
          <select id="filtro"><option value="activos">Activos</option><option value="inactivos">Inactivos</option><option value="todos">Todos</option></select></div>
        <button class="btn primario" id="btn-nuevo">+ Registrar paciente</button>
      </div>
      <div id="tabla-pacientes"></div>
    </section>
    <section class="tarjeta" id="form-paciente-caja" hidden></section>`;
  const cargar = async () => {
    const filas = await api('GET', `/psicologo/pacientes?q=${encodeURIComponent($('#buscar').value)}&estado=${$('#filtro').value}`);
    $('#tabla-pacientes').innerHTML = filas.length ? `<table><thead><tr><th>Paciente</th><th>Edad</th><th>Correo</th><th>Consentimiento</th><th>Último riesgo</th><th>Pendientes</th></tr></thead><tbody>
      ${filas.map(p => `<tr class="clic" data-pac="${p.id_paciente}"><td><b>${esc(p.nombre)} ${esc(p.apellidos)}</b></td><td>${esc(p.edad)}</td>
        <td>${esc(p.correo)}</td><td>${estado(p.consentimiento)}</td><td>${nivel(p.riesgo)}</td><td>${esc(p.pendientes)}</td></tr>`).join('')}</tbody></table>`
      : '<p class="vacio">No hay pacientes que coincidan.</p>';
    document.querySelectorAll('[data-pac]').forEach(el => el.onclick = () => location.hash = '#/paciente/' + el.dataset.pac);
  };
  $('#buscar').oninput = () => { clearTimeout(cargar._t); cargar._t = setTimeout(cargar, 250); };
  $('#filtro').onchange = cargar;
  $('#btn-nuevo').onclick = formularioPaciente;
  await cargar();
}

function formularioPaciente() {
  const caja = $('#form-paciente-caja'); caja.hidden = false;
  caja.innerHTML = `<h2>Registrar paciente</h2>
    <form id="form-paciente" class="form-grid" novalidate>
      <label>Nombre(s) <span class="req">*</span><input name="nombre" maxlength="60"><span class="msg-campo"></span></label>
      <label>Apellidos <span class="req">*</span><input name="apellidos" maxlength="80"><span class="msg-campo"></span></label>
      <label>Fecha de nacimiento <span class="req">*</span><input name="fechaNacimiento" type="date"><span class="msg-campo"></span></label>
      <label>Género <span class="req">*</span><select name="genero"><option value="">Selecciona…</option><option value="FEMENINO">Femenino</option><option value="MASCULINO">Masculino</option><option value="NO_BINARIO">No binario</option><option value="NO_ESPECIFICA">Prefiere no decir</option></select><span class="msg-campo"></span></label>
      <label>Teléfono <span class="req">*</span><input name="telefono" inputmode="numeric" maxlength="10" placeholder="10 dígitos"><span class="msg-campo"></span></label>
      <label>Correo <span class="req">*</span><input name="correo" type="email" maxlength="100"><span class="msg-campo"></span></label>
      <label>Contacto de emergencia<input name="contactoNombre" maxlength="80"><span class="msg-campo"></span></label>
      <label>Teléfono del contacto<input name="contactoTelefono" inputmode="numeric" maxlength="10"><span class="msg-campo"></span></label>
      <label class="completo">Motivo de consulta <span class="req">*</span><textarea name="motivo" rows="2" maxlength="500"></textarea><span class="msg-campo"></span></label>
      <p class="error completo" id="pac-error"></p>
      <div class="acciones completo"><button type="button" class="btn secundario" id="pac-cancelar">Cancelar</button><button class="btn primario">Registrar y enviar invitación</button></div>
    </form>`;
  const f = $('#form-paciente');
  const reglas = {
    nombre: v => /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ' ]+$/.test(v) || 'Obligatorio, solo letras.',
    apellidos: v => /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ' ]+$/.test(v) || 'Obligatorio, solo letras.',
    fechaNacimiento: v => { const e = (Date.now() - new Date(v)) / 3.15576e10; return (v && e >= 1 && e <= 120) || 'La edad debe estar entre 1 y 120 años.'; },
    genero: v => !!v || 'Selecciona una opción.',
    telefono: v => /^\d{10}$/.test(v) || 'Debe tener 10 dígitos.',
    correo: v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || 'Correo no válido (usuario@dominio).',
    contactoTelefono: v => !v || /^\d{10}$/.test(v) || 'Debe tener 10 dígitos.',
    motivo: v => !!v.trim() || 'Escribe el motivo de consulta.',
  };
  const validar = (campo, msg) => {
    const el = f.elements[campo], r = msg ?? reglas[campo]?.(el.value.trim());
    const ok = r === true || r === undefined;
    el.classList.toggle('invalido', !ok); el.classList.toggle('valido', ok && !!el.value);
    el.parentElement.querySelector('.msg-campo').textContent = ok ? '' : r;
    return ok;
  };
  Object.keys(reglas).forEach(c => f.elements[c].addEventListener('blur', () => validar(c)));
  $('#pac-cancelar').onclick = () => { $('#form-paciente-caja').hidden = true; };
  f.onsubmit = async e => {
    e.preventDefault();
    if (!Object.keys(reglas).map(c => validar(c)).every(Boolean)) return $('#pac-error').textContent = 'Revisa los campos marcados en rojo.';
    const datos = Object.fromEntries(new FormData(f));
    try {
      const r = await api('POST', '/psicologo/pacientes', datos);
      toast(r.mensaje); location.hash = '#/paciente/' + r.idPaciente;
    } catch (err) {
      $('#pac-error').textContent = err.message;
      Object.entries(err.datos?.campos || {}).forEach(([c, m]) => validar(c, m));
    }
  };
}

// ---------- GUI-2.3 Expediente clínico (S-06) ----------
async function vistaExpediente(id) {
  const d = await api('GET', '/psicologo/pacientes/' + id);
  const p = d.paciente, ex = d.expediente || {};
  $('#titulo').textContent = `Expediente · ${p.nombre} ${p.apellidos}`;
  $('#contenido').innerHTML = `
    <section class="tarjeta">
      <div class="fila entre"><h2>${esc(p.nombre)} ${esc(p.apellidos)}</h2>
        <div class="fila"><a class="btn secundario" href="#/asignar/${p.id_paciente}">Asignar instrumento</a></div></div>
      <div class="datos">
        <div><span>Edad</span>${esc(p.edad)} años</div><div><span>Género</span>${esc(p.genero)}</div>
        <div><span>Teléfono</span>${esc(p.telefono)}</div><div><span>Correo</span>${esc(p.correo)}</div>
        <div><span>Contacto de emergencia</span>${esc(p.contacto_emergencia_nombre || '—')} ${esc(p.contacto_emergencia_telefono || '')}</div>
        <div><span>Consentimiento</span>${estado(d.consentimiento?.estado)} ${d.consentimiento?.fecha_firma ? fecha(d.consentimiento.fecha_firma) : ''}</div>
        <div><span>Expediente</span>#${esc(ex.id_expediente)} ${estado(ex.estado)}</div><div><span>Apertura</span>${fecha(ex.fecha_apertura)}</div>
      </div>
      <p><b>Motivo de consulta:</b> ${esc(ex.motivo_consulta)}<br><b>Diagnóstico:</b> ${esc(ex.diagnostico || 'Sin diagnóstico registrado')}</p>
    </section>
    <div class="dos-col">
      <section class="tarjeta"><h2>Notas de evolución</h2>
        <form id="form-nota" class="form-grid" novalidate>
          <label>Tipo de nota <span class="req">*</span><select id="nota-tipo"><option value="SESION">Sesión</option><option value="SEGUIMIENTO">Seguimiento</option><option value="LLAMADA">Llamada</option></select></label>
          <label>Actualizar diagnóstico<input id="nota-dx" placeholder="Opcional" value=""></label>
          <label class="completo">Nota clínica <span class="req">*</span><textarea id="nota-texto" rows="3" maxlength="2000"></textarea><span class="msg-campo" id="nota-error"></span></label>
          <div class="acciones completo"><button class="btn primario">Guardar nota</button></div>
        </form>
        <div class="notas" style="margin-top:14px">${d.notas.map(n => `<div class="nota"><small>${fecha(n.fecha)} · ${esc(n.tipo_nota)} · ${esc(n.psicologo)}</small><div>${esc(n.texto)}</div></div>`).join('') || '<p class="vacio">Sin notas.</p>'}</div>
      </section>
      <section class="tarjeta"><h2>Resultados</h2>
        ${d.resultados.length ? `<table><thead><tr><th>Fecha</th><th>Instrumento</th><th>Puntaje</th><th>Categoría</th></tr></thead><tbody>
          ${d.resultados.map(r => `<tr class="clic" data-res="${r.id_resultado}"><td>${fecha(r.fecha_aplicacion)}</td><td>${esc(r.instrumento)}</td><td>${esc(r.puntaje)}</td><td>${esc(r.categoria)}</td></tr>`).join('')}</tbody></table>` : '<p class="vacio">Sin resultados.</p>'}
        <h3 style="margin-top:16px">Evaluaciones pendientes</h3>
        ${d.evaluaciones.map(e => `<div class="fila entre"><span>${esc(e.siglas)} · vence ${fecha(e.fecha_limite)}</span>${estado(e.estado)}</div>`).join('') || '<p class="vacio">Ninguna.</p>'}
      </section>
    </div>`;
  document.querySelectorAll('[data-res]').forEach(el => el.onclick = () => location.hash = '#/resultado/' + el.dataset.res);
  $('#form-nota').onsubmit = async e => {
    e.preventDefault();
    const texto = $('#nota-texto').value.trim();
    if (!texto) { $('#nota-texto').classList.add('invalido'); return $('#nota-error').textContent = 'La nota clínica no puede estar vacía.'; }
    try { await api('POST', `/psicologo/pacientes/${id}/notas`, { tipo: $('#nota-tipo').value, texto, diagnostico: $('#nota-dx').value }); toast('Nota guardada en el expediente.'); vistaExpediente(id); }
    catch (err) { $('#nota-error').textContent = err.message; }
  };
}

// ---------- GUI-3.1 Asignar instrumento (CU-02) ----------
async function vistaAsignar(idPaciente) {
  const [pacientes, instrumentos] = await Promise.all([api('GET', '/psicologo/pacientes'), api('GET', '/psicologo/instrumentos')]);
  const manana = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
  $('#contenido').innerHTML = `
    <section class="tarjeta"><form id="form-asignar" class="form-grid" novalidate>
      <label class="completo">Paciente <span class="req">*</span><select id="as-pac"><option value="">Selecciona…</option>
        ${pacientes.map(p => `<option value="${p.id_paciente}" ${String(p.id_paciente) === String(idPaciente) ? 'selected' : ''}>${esc(p.nombre)} ${esc(p.apellidos)}</option>`).join('')}</select></label>
      <fieldset class="completo" style="border:1px solid var(--gris-300);border-radius:8px;padding:12px"><legend><b>Instrumentos</b> <span class="req">*</span></legend>
        ${instrumentos.map(i => `<label class="check"><input type="checkbox" value="${i.id_instrumento}"> <b>${esc(i.siglas)}</b> · ${esc(i.nombre)} <small style="color:var(--gris-500)">(${i.preguntas} reactivos, ${esc(i.version_autorizada)})</small></label>`).join('')}
      </fieldset>
      <label>Fecha límite <span class="req">*</span><input id="as-fecha" type="date" value="${manana}"></label>
      <label>Recordatorio<select id="as-rec"><option value="24">24 h antes</option><option value="48">48 h antes</option><option value="">Sin recordatorio</option></select></label>
      <label>Repetir<select id="as-rep"><option value="">No repetir</option><option value="7">Cada semana</option><option value="14">Cada 2 semanas</option></select></label>
      <label class="completo">Mensaje para el paciente<textarea id="as-msg" rows="2" maxlength="300" placeholder="Opcional"></textarea></label>
      <p class="error completo" id="as-error"></p>
      <div class="acciones completo"><a class="btn secundario" href="#/pacientes">Cancelar</a><button class="btn primario">Confirmar asignación</button></div>
    </form></section>`;
  $('#form-asignar').onsubmit = async e => {
    e.preventDefault();
    const sel = [...document.querySelectorAll('#form-asignar input[type=checkbox]:checked')].map(c => Number(c.value));
    const idP = $('#as-pac').value, f = $('#as-fecha').value;
    if (!idP || !sel.length) return $('#as-error').textContent = 'Selecciona al menos un paciente y un instrumento.';
    if (!f || f <= new Date().toISOString().slice(0, 10)) return $('#as-error').textContent = 'La fecha límite debe ser posterior a hoy.';
    try {
      await api('POST', '/psicologo/evaluaciones', { idPaciente: Number(idP), instrumentos: sel, fechaLimite: f, recordatorioHoras: $('#as-rec').value, repetirCadaDias: $('#as-rep').value, mensaje: $('#as-msg').value });
      toast('Instrumento asignado. Se notificó al paciente en la app.'); location.hash = '#/paciente/' + idP;
    } catch (err) { $('#as-error').textContent = err.message; }
  };
}

// ---------- GUI-4.1 Resultados clínicos (CU-04) ----------
async function vistaResultados() {
  api('POST', '/psicologo/notificaciones/leer').then(vigilar).catch(() => {});
  const filas = await api('GET', '/psicologo/resultados');
  $('#contenido').innerHTML = `<section class="tarjeta">${filas.length ? `<table><thead><tr><th>Fecha</th><th>Paciente</th><th>Instrumento</th><th>Puntaje</th><th>Categoría</th><th>Retroalimentación</th></tr></thead><tbody>
    ${filas.map(r => `<tr class="clic" data-res="${r.id_resultado}"><td>${fecha(r.fecha_aplicacion)}</td><td>${esc(r.paciente)}</td><td>${esc(r.instrumento)}</td>
      <td><b>${esc(r.puntaje)}</b></td><td>${esc(r.categoria)}</td><td>${r.retroalimentacion_autorizada ? estado('ATENDIDA').replace('ATENDIDA', 'Autorizada') : estado('PENDIENTE').replace('PENDIENTE', 'Por autorizar')}</td></tr>`).join('')}
    </tbody></table>` : '<p class="vacio">Aún no hay resultados.</p>'}</section>`;
  document.querySelectorAll('[data-res]').forEach(el => el.onclick = () => location.hash = '#/resultado/' + el.dataset.res);
}

// Detalle + reporte imprimible (S-04 / S-05, CU-08)
async function vistaResultado(id) {
  const r = await api('GET', '/psicologo/resultados/' + id);
  const maxEv = Math.max(...r.evolucion.map(e => e.puntaje), 1);
  $('#contenido').innerHTML = `
    <div class="fila entre no-print">
      <a class="btn texto con-ico" href="#/resultados">${ICONO.atras()} Volver a resultados</a>
      <div class="fila">
        ${r.retroalimentacion_autorizada ? `<span class="estado ATENDIDA con-ico">${ICONO.check()} Retroalimentación autorizada</span>` : '<button class="btn secundario" id="btn-autorizar">Autorizar retroalimentación al paciente</button>'}
        <button class="btn primario con-ico" onclick="window.print()">${ICONO.descargar()} Descargar reporte (PDF)</button>
      </div>
    </div>
    <article class="reporte">
      <div class="cab"><div class="logo"><span class="logo-icono">S</span> SentIA</div>
        <div style="text-align:right"><b>Reporte de resultados clínicos</b><br><small>Folio R-${String(r.id_resultado).padStart(5, '0')} · ${fecha(r.fecha_resultado)}</small></div></div>
      <div class="datos">
        <div><span>Paciente</span><b>${esc(r.paciente)}</b></div><div><span>Edad / género</span>${esc(r.edad)} años · ${esc(r.genero)}</div>
        <div><span>Expediente</span>#${esc(r.id_expediente)}</div><div><span>Instrumento</span>${esc(r.nombre_instrumento)} (${esc(r.instrumento)})</div>
        <div><span>Fecha de aplicación</span>${fecha(r.fecha_aplicacion)}</div><div><span>Aplicado por</span>App SentIA (autoaplicado)</div>
      </div>
      <div class="kpis" style="margin:18px 0">
        <div class="kpi morado"><b>${esc(r.puntaje)}</b><span>Puntaje total</span></div>
        <div class="kpi ${r.indica_riesgo ? 'rojo' : ''}"><b style="font-size:20px">${esc(r.categoria)}</b><span>Rango ${esc(r.puntaje_min)}–${esc(r.puntaje_max)}${r.indica_riesgo ? ' · indica riesgo' : ''}</span></div>
      </div>
      <p><b>Interpretación (pre-valoración):</b> ${esc(r.interpretacion)}</p>
      <p><b>Recomendación:</b> ${esc(r.recomendacion)}</p>
      <h3>Guía de evaluación</h3>
      <p>${r.guia.map(g => `${esc(g.categoria)}: ${g.puntaje_min}–${g.puntaje_max}${g.indica_riesgo ? ' (indica riesgo)' : ''}`).join(' · ')}</p>
      <h3>Evolución de puntajes (${esc(r.instrumento)})</h3>
      <div class="barras">${r.evolucion.map(e => `<div class="barra-v"><b>${e.puntaje}</b><i style="height:${Math.max(6, e.puntaje / maxEv * 120)}px"></i>${fecha(e.fecha_aplicacion)}</div>`).join('')}</div>
      <h3 style="margin-top:16px">Valor por reactivo</h3>
      <table><thead><tr><th>#</th><th>Reactivo</th><th>Valor</th></tr></thead><tbody>
        ${r.respuestas.map(x => `<tr><td>${x.numero}</td><td>${esc(x.texto)}</td><td>${x.valor} / ${x.valor_maximo}</td></tr>`).join('')}</tbody></table>
      <p style="margin-top:24px"><small>${esc(r.psicologo)} · Cédula profesional ${esc(r.cedula_profesional)}<br>Documento confidencial con datos personales sensibles (LFPDPPP).</small></p>
    </article>`;
  const b = $('#btn-autorizar');
  if (b) b.onclick = async () => { await api('POST', `/psicologo/resultados/${id}/autorizar`); toast('El paciente ya puede ver su retroalimentación.'); vistaResultado(id); };
}

// ---------- Reportes S-08 y S-09 ----------
async function vistaReportes() {
  const [pend, est] = await Promise.all([api('GET', '/psicologo/reportes/pendientes'), api('GET', '/psicologo/reportes/alertas')]);
  $('#contenido').innerHTML = `
    <section class="tarjeta"><h2>Evaluaciones pendientes y vencidas (S-08)</h2>
      ${pend.length ? `<table><thead><tr><th>Paciente</th><th>Instrumento</th><th>Asignada</th><th>Límite</th><th>Situación</th><th>Avance</th></tr></thead><tbody>
      ${pend.map(p => `<tr><td>${esc(p.paciente)}</td><td>${esc(p.instrumento)}</td><td>${fecha(p.fecha_asignacion)}</td><td>${fecha(p.fecha_limite)}</td><td>${estado(p.situacion === 'VENCIDA' ? 'RECHAZADO' : p.situacion).replace('RECHAZADO', 'VENCIDA')}</td><td>${esc(p.avance_pct ?? 0)} %</td></tr>`).join('')}
      </tbody></table>` : '<p class="vacio">No hay evaluaciones pendientes.</p>'}</section>
    <section class="tarjeta"><h2>Estadística de alertas (S-09)</h2>
      <table><thead><tr><th>Nivel</th><th>Origen</th><th>Alertas</th><th>Min. promedio de atención</th><th>Escaladas</th></tr></thead><tbody>
      ${est.map(a => `<tr><td>${nivel(a.nivel_riesgo)}</td><td>${esc(ORIGEN_TXT[a.origen])}</td><td>${a.alertas}</td><td>${a.minutos_promedio_atencion ?? '—'}</td><td>${a.escaladas}</td></tr>`).join('')}
      </tbody></table></section>`;
}

// ---------- Bitácora (CU-17) ----------
async function vistaBitacora() {
  const filas = await api('GET', '/psicologo/bitacora');
  $('#contenido').innerHTML = `<section class="tarjeta"><p style="margin-top:0;color:var(--gris-700)">Accesos, operaciones y errores. El detalle no guarda datos clínicos.</p>
    <table><thead><tr><th>Fecha y hora</th><th>Tipo</th><th>Usuario</th><th>Detalle</th><th>IP</th></tr></thead><tbody>
    ${filas.map(b => `<tr><td>${fecha(b.fecha_hora)}</td><td>${estado(b.tipo_evento === 'ERROR' ? 'RECHAZADO' : 'INICIADA').replace(/RECHAZADO|INICIADA/, esc(b.tipo_evento))}</td>
      <td>${esc(b.correo || 'Sistema')}</td><td>${esc(b.detalle)}</td><td>${esc(b.ip_origen || '—')}</td></tr>`).join('')}</tbody></table></section>`;
}

// ---------- Arranque ----------
if (sesion) iniciar(); else $('#vista-login').hidden = false;
