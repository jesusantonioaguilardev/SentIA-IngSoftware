// SentIA · API y software de monitoreo (prototipo semifuncional)
const express = require('express');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { pool, esperarBD, modo } = require('./db');
const Bitacora = require('./dominio/Bitacora');

const app = express();
const PUERTO = Number(process.env.PORT || 3000);

// Las fechas de SQL Server llegan como hora local "vista como UTC"; se envían como "AAAA-MM-DD hh:mm".
app.set('json replacer', function (clave, valor) {
  const original = this[clave];
  if (original instanceof Date) {
    const iso = original.toISOString();
    return iso.endsWith('T00:00:00.000Z') ? iso.slice(0, 10) : iso.slice(0, 16).replace('T', ' ');
  }
  return valor;
});

app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => { // CORS sencillo para pruebas
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.get('/api/ping', async (req, res) => {
  try {
    await (await pool()).request().query('SELECT 1');
    res.json({ ok: true, servicio: 'SentIA', bd: 'conectada' });
  } catch (e) {
    res.status(500).json({ ok: false, bd: 'sin conexión', error: e.message });
  }
});

app.use('/api/auth', require('./routes/auth').router);
app.use('/api/paciente', require('./routes/paciente'));
app.use('/api/psicologo', require('./routes/psicologo'));
app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta no encontrada.' }));

// APK de la app del paciente (si ya se compiló), para instalarla desde el celular o el navegador.
const APK = process.env.SENTIA_APK || path.join(__dirname, '..', 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
app.get('/descargar-app', (req, res) => {
  if (!fs.existsSync(APK)) return res.status(404).send('Todavía no hay APK. Compílala con: cd android && .\\gradlew assembleDebug');
  res.download(APK, 'SentIA.apk');
});

// Software de monitoreo del psicólogo
app.use(express.static(path.join(__dirname, '..', 'monitoreo')));

app.use((err, req, res, next) => { // bitácora de errores (RNF fiabilidad)
  console.error(err);
  Bitacora.registrar('ERROR', `${req.method} ${req.path}: ${err.message}`.slice(0, 300), req.usuario && req.usuario.idUsuario, req.ip);
  res.status(err.status || 500).json({ error: err.status ? err.message : 'Ocurrió un error en el servidor. Intenta de nuevo.' });
});

esperarBD().then(() => {
  app.listen(PUERTO, '0.0.0.0', () => {
    console.log(`SentIA escuchando en el puerto ${PUERTO} (BD por ${modo === 'tcp' ? 'TCP ' + process.env.SENTIA_DB_HOST : 'autenticación de Windows'})`);
    console.log(`  Software de monitoreo: http://localhost:${PUERTO}`);
    console.log(`  App en el emulador:    http://10.0.2.2:${PUERTO}`);
    if (modo === 'tcp') console.log('  App en celular (Wi-Fi): http://IP-de-la-laptop:' + PUERTO);
    else Object.values(os.networkInterfaces()).flat().filter(i => i && i.family === 'IPv4' && !i.internal)
      .forEach(i => console.log(`  App en celular (Wi-Fi): http://${i.address}:${PUERTO}`));
  });
}).catch(e => { console.error('No se pudo conectar a SQL Server:', e.message); process.exit(1); });
