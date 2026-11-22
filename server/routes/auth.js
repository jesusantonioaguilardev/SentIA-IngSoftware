// CU-13 Iniciar Sesión (GUI-0.1 y GUI-0.3) con bloqueo tras 3 intentos y registro en bitácora.
const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { q, uno } = require('../db');
const Bitacora = require('../dominio/Bitacora');

const router = express.Router();
const tokens = new Map(); // token → usuario (en memoria; suficiente para el prototipo)
const CORREO_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post('/login', async (req, res) => {
  const correo = String(req.body.correo || '').trim().toLowerCase();
  const contrasena = String(req.body.contrasena || '');
  if (!CORREO_VALIDO.test(correo) || contrasena.length < 8) {
    return res.status(400).json({ error: 'Escribe un correo válido y una contraseña de al menos 8 caracteres.' });
  }
  const u = await uno(`SELECT *, CASE WHEN bloqueado_hasta > SYSDATETIME() THEN 1 ELSE 0 END AS bloqueado
                       FROM usuario WHERE correo = @c`, { c: correo });
  const generico = { error: 'Correo o contraseña incorrectos.' }; // CU-13 3A: no dice cuál falló

  if (!u || !u.activo) {
    await Bitacora.registrar('ACCESO', 'Intento de acceso con cuenta inexistente o inactiva', null, req.ip);
    return res.status(401).json(generico);
  }
  if (u.bloqueado) {
    return res.status(423).json({ error: 'Tu cuenta está bloqueada temporalmente por 3 intentos fallidos. Intenta en 5 minutos.' });
  }
  if (!bcrypt.compareSync(contrasena, u.contrasena_hash)) {
    const r = await uno(`UPDATE usuario SET intentos_fallidos = intentos_fallidos + 1,
                           bloqueado_hasta = CASE WHEN intentos_fallidos + 1 >= 3 THEN DATEADD(MINUTE, 5, SYSDATETIME()) ELSE NULL END
                         OUTPUT INSERTED.intentos_fallidos WHERE id_usuario = @u`, { u: u.id_usuario });
    if (r.intentos_fallidos >= 3) {
      await Bitacora.registrar('ACCESO', 'Cuenta bloqueada temporalmente por 3 intentos fallidos', u.id_usuario, req.ip);
      return res.status(423).json({ error: 'Tu cuenta quedó bloqueada 5 minutos por 3 intentos fallidos.' });
    }
    await Bitacora.registrar('ACCESO', 'Intento de acceso fallido', u.id_usuario, req.ip);
    return res.status(401).json(generico);
  }
  await q(`UPDATE usuario SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id_usuario = @u`, { u: u.id_usuario });

  const cliente = req.body.cliente === 'app' ? 'app' : 'monitoreo';
  let perfil;
  if (u.rol === 'PSICOLOGO') {
    if (cliente === 'app') return res.status(403).json({ error: 'Los psicólogos usan el software de monitoreo, no la app.' });
    const p = await uno(`SELECT id_psicologo, nombre, apellidos FROM psicologo WHERE id_usuario = @u`, { u: u.id_usuario });
    perfil = { idPsicologo: p.id_psicologo, nombre: `${p.nombre} ${p.apellidos}` };
  } else {
    if (cliente !== 'app') return res.status(403).json({ error: 'Los pacientes entran desde la app móvil.' });
    const p = await uno(`SELECT p.id_paciente, p.nombre, p.apellidos,
                           (SELECT TOP 1 estado FROM consentimiento c WHERE c.id_paciente = p.id_paciente ORDER BY id_consentimiento DESC) AS consentimiento
                         FROM paciente p WHERE p.id_usuario = @u`, { u: u.id_usuario });
    perfil = { idPaciente: p.id_paciente, nombre: p.nombre, apellidos: p.apellidos, consentimiento: p.consentimiento || 'PENDIENTE' };
  }

  const token = crypto.randomBytes(24).toString('hex');
  const sesion = { idUsuario: u.id_usuario, rol: u.rol, correo: u.correo, ...perfil };
  tokens.set(token, sesion);
  await Bitacora.registrar('ACCESO', u.rol === 'PSICOLOGO' ? 'Inicio de sesión en software de monitoreo' : 'Inicio de sesión en app', u.id_usuario, req.ip);
  res.json({ token, rol: u.rol, ...perfil });
});

router.post('/logout', (req, res) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const s = tokens.get(token);
  tokens.delete(token);
  if (s) Bitacora.registrar('ACCESO', 'Cierre de sesión', s.idUsuario, req.ip);
  res.json({ ok: true });
});

/** Middleware: exige token válido y, opcionalmente, un rol. */
function requiere(rol) {
  return (req, res, next) => {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    const s = tokens.get(token);
    if (!s) return res.status(401).json({ error: 'Tu sesión terminó. Vuelve a iniciar sesión.' });
    if (rol && s.rol !== rol) return res.status(403).json({ error: 'No tienes permiso para esta acción.' });
    req.usuario = s;
    next();
  };
}

module.exports = { router, requiere, tokens };
