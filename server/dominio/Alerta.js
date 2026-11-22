// Clase Alerta (hereda de Notificacion). Sigue el diagrama de estados del entregable 08:
// GENERADA → REGISTRADA → ENVIADA → (ESCALADA) → LEIDA → EN_ATENCION → ATENDIDA
const { q, uno, transaccion } = require('../db');
const Bitacora = require('./Bitacora');

const PRIORIDAD = { CRITICO: 1, ALTO: 2, MEDIO: 3, BAJO: 4 };
const MINUTOS_ESCALAR = Number(process.env.SENTIA_ESCALAR_MIN || 5);

class Alerta {
  constructor(datos) { Object.assign(this, datos); }

  /** generarAlerta(nivel): crea la notificación y su alerta en estado GENERADA. */
  static async generarAlerta({ idPaciente, nivel, origen, idSesion = null, idResultado = null, motivo }) {
    const pac = await uno(`SELECT p.nombre + ' ' + p.apellidos AS nombre, ps.id_usuario AS id_usuario_psicologo
                           FROM paciente p JOIN psicologo ps ON ps.id_psicologo = p.id_psicologo
                           WHERE p.id_paciente = @p`, { p: idPaciente });
    const etiqueta = nivel === 'CRITICO' ? 'CRÍTICA' : nivel;
    const mensaje = `Alerta ${etiqueta}: ${pac.nombre}. ${motivo || ''}`.trim().slice(0, 300);

    const alerta = await transaccion(async tx => {
      const n = await uno(`INSERT INTO notificacion (id_usuario, tipo, canal, mensaje) OUTPUT INSERTED.id_notificacion
                           VALUES (@u, 'ALERTA', 'PANTALLA', @m)`, { u: pac.id_usuario_psicologo, m: mensaje }, tx);
      await q(`INSERT INTO alerta (id_notificacion, id_paciente, id_sesion, id_resultado, origen, nivel_riesgo, prioridad, estado)
               VALUES (@id, @p, @s, @r, @o, @n, 4, 'GENERADA')`,
        { id: n.id_notificacion, p: idPaciente, s: idSesion, r: idResultado, o: origen, n: nivel }, tx);
      return new Alerta({ id: n.id_notificacion, idPaciente, nivel, origen, idSesion, idResultado });
    });

    await alerta.registrarNivelRiesgo(nivel);
    await alerta.enviarAlerta();
    await Bitacora.registrar('OPERACION', `Alerta #${alerta.id} generada (${nivel}, origen ${origen})`);
    return alerta;
  }

  /** registrarNivelRiesgo(nivel) + asignarPrioridad() → REGISTRADA */
  async registrarNivelRiesgo(nivel) {
    this.nivel = nivel;
    this.prioridad = this.asignarPrioridad();
    await q(`UPDATE alerta SET nivel_riesgo = @n, prioridad = @pr, estado = 'REGISTRADA' WHERE id_notificacion = @id`,
      { n: nivel, pr: this.prioridad, id: this.id });
  }

  asignarPrioridad() { return PRIORIDAD[this.nivel] || 4; }

  /** enviarAlerta(): llega al software de monitoreo → ENVIADA (el panel la consulta cada 3 s). */
  async enviarAlerta() {
    await q(`UPDATE alerta SET estado = 'ENVIADA' WHERE id_notificacion = @id`, { id: this.id });
    await q(`UPDATE notificacion SET fecha_envio = SYSDATETIME() WHERE id_notificacion = @id`, { id: this.id });
  }

  /** after(5 min) [nadie la leyó] → ESCALADA: SMS simulado al profesional de guardia (CU-07 4A). */
  static async escalarPendientes() {
    const vencidas = await q(`SELECT a.id_notificacion, ps.id_psicologo_guardia, g.id_usuario AS id_usuario_guardia,
                                     g.nombre + ' ' + g.apellidos AS guardia
                              FROM alerta a
                              JOIN notificacion n ON n.id_notificacion = a.id_notificacion
                              JOIN paciente p ON p.id_paciente = a.id_paciente
                              JOIN psicologo ps ON ps.id_psicologo = p.id_psicologo
                              LEFT JOIN psicologo g ON g.id_psicologo = ps.id_psicologo_guardia
                              WHERE a.estado = 'ENVIADA' AND n.leida = 0
                                AND DATEDIFF(SECOND, n.fecha_envio, SYSDATETIME()) >= @seg`, { seg: MINUTOS_ESCALAR * 60 });
    for (const a of vencidas) {
      await q(`UPDATE alerta SET estado = 'ESCALADA' WHERE id_notificacion = @id`, { id: a.id_notificacion });
      if (a.id_usuario_guardia) {
        // El SMS no lleva datos clínicos (salida S-01): solo pide abrir el sistema.
        await q(`INSERT INTO notificacion (id_usuario, tipo, canal, mensaje) VALUES (@u, 'ALERTA', 'SMS', @m)`,
          { u: a.id_usuario_guardia, m: `SentIA: hay una alerta sin atender (#${a.id_notificacion}). Abre el software de monitoreo.` });
      }
      await Bitacora.registrar('OPERACION', `Alerta #${a.id_notificacion} escalada por SMS (simulado) a ${a.guardia || 'guardia sin asignar'}`);
    }
    return vencidas.length;
  }

  static async marcarComoLeida(id) {
    await q(`UPDATE notificacion SET leida = 1 WHERE id_notificacion = @id`, { id });
    await q(`UPDATE alerta SET estado = 'LEIDA' WHERE id_notificacion = @id AND estado IN ('GENERADA','REGISTRADA','ENVIADA','ESCALADA')`, { id });
  }

  /** atenderAlerta(): el psicólogo abre la sesión del paciente → EN_ATENCION */
  static async atenderAlerta(id) {
    await Alerta.marcarComoLeida(id);
    await q(`UPDATE alerta SET estado = 'EN_ATENCION' WHERE id_notificacion = @id AND estado = 'LEIDA'`, { id });
  }

  /** Cierre con nota obligatoria (GUI-1.2) → ATENDIDA, y la nota pasa al expediente (actualizarNotas). */
  static async cerrar(id, idPsicologo, { accion, nota, nivelPosterior, seguimiento }) {
    await transaccion(async tx => {
      await q(`INSERT INTO atencion_alerta (id_notificacion, id_psicologo, accion, fecha_atencion, nota, nivel_riesgo_posterior, requiere_seguimiento)
               VALUES (@id, @ps, @a, SYSDATETIME(), @n, @np, @seg)`,
        { id, ps: idPsicologo, a: accion.slice(0, 40), n: nota.slice(0, 500), np: nivelPosterior, seg: !!seguimiento }, tx);
      await q(`UPDATE alerta SET estado = 'ATENDIDA' WHERE id_notificacion = @id`, { id }, tx);
      await q(`UPDATE notificacion SET leida = 1 WHERE id_notificacion = @id`, { id }, tx);
      await q(`INSERT INTO nota_evolucion (id_expediente, id_psicologo, fecha, tipo_nota, texto)
               SELECT e.id_expediente, @ps, SYSDATETIME(), 'SEGUIMIENTO', @t
               FROM alerta a JOIN expediente_clinico e ON e.id_paciente = a.id_paciente WHERE a.id_notificacion = @id`,
        { id, ps: idPsicologo, t: `Atención de alerta #${id} (${accion}): ${nota}`.slice(0, 2000) }, tx);
      // Si la alerta venía de una conversación, la sesión baja al nivel posterior.
      await q(`UPDATE s SET nivel_riesgo = @np FROM sesion s JOIN alerta a ON a.id_sesion = s.id_sesion WHERE a.id_notificacion = @id`,
        { id, np: nivelPosterior }, tx);
    });
  }
}

Alerta.PRIORIDAD = PRIORIDAD;
module.exports = Alerta;
