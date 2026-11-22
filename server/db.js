// Conexión a SQL Server. Dos modos:
//  - Docker (o cualquier servidor por TCP): se define SENTIA_DB_HOST y se usa el driver tedious (JavaScript puro).
//  - Local en Windows sin Docker: autenticación de Windows por memoria compartida (msnodesqlv8 + ODBC Driver 18).
const USAR_TCP = !!process.env.SENTIA_DB_HOST;
const sql = USAR_TCP ? require('mssql') : require('mssql/msnodesqlv8');

const CONFIG = USAR_TCP
  ? {
      server: process.env.SENTIA_DB_HOST,
      port: Number(process.env.SENTIA_DB_PORT || 1433),
      user: process.env.SENTIA_DB_USER || 'sa',
      password: process.env.SENTIA_DB_PASSWORD,
      database: process.env.SENTIA_DB_NAME || 'SentIA',
      options: { encrypt: false, trustServerCertificate: true },
      pool: { max: 10 },
    }
  : {
      connectionString: process.env.SENTIA_DB ||
        'Driver={ODBC Driver 18 for SQL Server};Server=lpc:localhost\\SQLEXPRESS;Database=SentIA;Trusted_Connection=yes;TrustServerCertificate=yes;',
    };

let poolPromise = null;
function pool() {
  if (!poolPromise) {
    poolPromise = new sql.ConnectionPool(CONFIG).connect()
      .then(p => { p.on('error', () => { poolPromise = null; }); return p; })
      .catch(e => { poolPromise = null; throw e; });
  }
  return poolPromise;
}

/** Espera a que la base de datos responda (al arrancar en Docker puede tardar unos segundos). */
async function esperarBD(intentos = 30) {
  for (let i = 1; i <= intentos; i++) {
    try { await (await pool()).request().query('SELECT 1'); return; }
    catch (e) {
      if (i === intentos) throw e;
      console.log(`Esperando a SQL Server (${i}/${intentos}): ${e.message}`);
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}

/**
 * Ejecuta una consulta con parámetros con nombre: q('SELECT … WHERE id = @id', { id: 5 }).
 * `ejecutor` permite usar una transacción en lugar del pool.
 */
async function q(texto, params = {}, ejecutor) {
  const req = ejecutor ? new sql.Request(ejecutor) : (await pool()).request();
  for (const [nombre, valor] of Object.entries(params)) {
    if (valor === null || valor === undefined) req.input(nombre, sql.NVarChar, null);
    else if (typeof valor === 'number' && Number.isInteger(valor)) req.input(nombre, sql.Int, valor);
    else if (typeof valor === 'boolean') req.input(nombre, sql.Bit, valor);
    else req.input(nombre, sql.NVarChar, String(valor));
  }
  const r = await req.query(texto);
  return r.recordset || [];
}

async function uno(texto, params, ejecutor) {
  const filas = await q(texto, params, ejecutor);
  return filas[0] || null;
}

/** Ejecuta `fn(tx)` dentro de una transacción. */
async function transaccion(fn) {
  const tx = new sql.Transaction(await pool());
  await tx.begin();
  try {
    const r = await fn(tx);
    await tx.commit();
    return r;
  } catch (e) {
    try { await tx.rollback(); } catch { /* ya revertida */ }
    throw e;
  }
}

module.exports = { q, uno, transaccion, pool, esperarBD, modo: USAR_TCP ? 'tcp' : 'windows' };
