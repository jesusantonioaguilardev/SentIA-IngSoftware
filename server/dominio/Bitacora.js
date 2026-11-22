// CU-17 Registrar Bitácora de Actividad.
const { q } = require('../db');

const PATRONES_SENSIBLES = /(diagn[oó]stico|ansiedad|depresi|suicid|puntaje|\d{10})/gi;

class Bitacora {
  /** tipo: ACCESO | OPERACION | ERROR. El detalle nunca debe llevar datos clínicos. */
  static async registrar(tipo, detalle, idUsuario = null, ip = null) {
    const limpio = String(detalle).replace(PATRONES_SENSIBLES, '[omitido]').slice(0, 300);
    try {
      await q(`INSERT INTO bitacora (id_usuario, tipo_evento, detalle, ip_origen)
               VALUES (@u, @t, @d, @ip)`, { u: idUsuario, t: tipo, d: limpio, ip: ip ? String(ip).slice(0, 45) : null });
    } catch (e) {
      // CU-17 3A: si falla, se conserva en consola para reintentar después.
      console.error('[bitacora pendiente]', tipo, limpio, e.message);
    }
  }
}

module.exports = Bitacora;
