// Clase Sesion (diagrama de clases 07, Secuencia 1 del entregable 06).
// La "IA" del prototipo es un analizador por reglas con léxico en español.
const { q, uno } = require('../db');

const NIVELES = ['BAJO', 'MEDIO', 'ALTO', 'CRITICO'];

function normalizar(texto) {
  return String(texto).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9ñ\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

const LEXICO_RIESGO = {
  CRITICO: ['quitarme la vida', 'suicid', 'matarme', 'hacerme dano', 'no quiero vivir', 'quiero morir',
    'morirme', 'nada tiene sentido', 'no vale la pena vivir', 'cortarme', 'acabar con todo', 'desaparecer para siempre'],
  ALTO: ['no puedo mas', 'crisis', 'panico', 'desesperad', 'no aguanto', 'ataque de ansiedad', 'me ahogo',
    'no puedo respirar', 'sin salida', 'nadie me quiere', 'soy una carga'],
  MEDIO: ['triste', 'ansiedad', 'ansios', 'solo', 'sola', 'llorar', 'llore', 'estres', 'estresad', 'miedo',
    'no puedo dormir', 'insomnio', 'preocupad', 'nervios'],
};

const LEXICO_EMOCION = [
  ['Desesperanza', ['nada tiene sentido', 'sin salida', 'no vale la pena', 'no quiero vivir', 'quiero morir', 'no puedo mas', 'soy una carga']],
  ['Ansiedad', ['ansiedad', 'ansios', 'panico', 'nervios', 'me ahogo', 'no puedo respirar', 'preocupad', 'estres']],
  ['Tristeza', ['triste', 'llorar', 'llore', 'solo', 'sola', 'vacio', 'deprimid']],
  ['Enojo', ['enojad', 'coraje', 'furios', 'odio', 'molest']],
  ['Miedo', ['miedo', 'asustad', 'terror']],
  ['Calma', ['bien', 'tranquil', 'feliz', 'mejor', 'contento', 'contenta', 'gracias']],
];

const RESPUESTAS = {
  Desesperanza: 'Gracias por contármelo, sé que no es fácil. Lo que sientes importa y no tienes que pasarlo a solas.',
  Ansiedad: 'Parece que estás sintiendo mucha ansiedad. Probemos algo juntos: inhala contando hasta 4, sostén 4 y exhala en 6. Repítelo tres veces.',
  Tristeza: 'Lamento que te sientas así. Está bien sentirse triste; ¿quieres contarme qué pasó hoy?',
  Enojo: 'Entiendo que algo te molestó. Ponerle nombre a lo que sientes ya es un buen paso. ¿Qué fue lo que más te afectó?',
  Miedo: 'Sentir miedo puede ser muy pesado. Estás en un lugar seguro para hablarlo. ¿Qué es lo que te preocupa?',
  Calma: 'Me alegra leerte así. ¿Qué fue lo que te ayudó hoy? Vale la pena recordarlo.',
  Neutral: 'Te leo. Cuéntame un poco más de cómo te has sentido desde tu última sesión.',
};

class Sesion {
  constructor(fila) { Object.assign(this, fila); }

  /** iniciarConversacion(idPaciente): reutiliza la sesión ACTIVA o abre una nueva. */
  static async iniciarConversacion(idPaciente) {
    let fila = await uno(`SELECT TOP 1 * FROM sesion WHERE id_paciente = @p AND estado IN ('ACTIVA','INACTIVA')
                          ORDER BY fecha_inicio DESC`, { p: idPaciente });
    if (fila && fila.estado === 'INACTIVA') {
      await q(`UPDATE sesion SET estado = 'ACTIVA' WHERE id_sesion = @s`, { s: fila.id_sesion });
      fila.estado = 'ACTIVA';
    }
    if (!fila) {
      fila = await uno(`INSERT INTO sesion (id_paciente, estado, nivel_riesgo) OUTPUT INSERTED.*
                        VALUES (@p, 'ACTIVA', 'BAJO')`, { p: idPaciente });
      await q(`INSERT INTO mensaje (id_sesion, emisor, texto) VALUES (@s, 'SENTIA', @t)`,
        { s: fila.id_sesion, t: 'Hola, soy SentIA. Estoy aquí para acompañarte entre tus sesiones. ¿Cómo te sientes hoy?' });
    }
    return new Sesion(fila);
  }

  /** analizarEmocion(texto): guarda y devuelve la emoción predominante. */
  async analizarEmocion(texto) {
    const n = normalizar(texto);
    this._texto = n;
    let emocion = 'Neutral';
    for (const [nombre, palabras] of LEXICO_EMOCION) {
      if (palabras.some(p => n.includes(p))) { emocion = nombre; break; }
    }
    this.emocion_detectada = emocion;
    await q(`UPDATE sesion SET emocion_detectada = @e WHERE id_sesion = @s`, { e: emocion, s: this.id_sesion });
    return emocion;
  }

  /** evaluarNivelRiesgo(): BAJO, MEDIO, ALTO o CRITICO según el último mensaje analizado. */
  async evaluarNivelRiesgo() {
    const n = this._texto || '';
    let nivel = 'BAJO';
    for (const candidato of ['CRITICO', 'ALTO', 'MEDIO']) {
      if (LEXICO_RIESGO[candidato].some(p => n.includes(p))) { nivel = candidato; break; }
    }
    // La sesión conserva el nivel más alto alcanzado para que el panel no lo pierda.
    const maximo = NIVELES[Math.max(NIVELES.indexOf(nivel), NIVELES.indexOf(this.nivel_riesgo || 'BAJO'))];
    this.nivel_riesgo = maximo;
    await q(`UPDATE sesion SET nivel_riesgo = @n WHERE id_sesion = @s`, { n: maximo, s: this.id_sesion });
    return nivel;
  }

  async guardarMensaje(emisor, texto) {
    await q(`INSERT INTO mensaje (id_sesion, emisor, texto) VALUES (@s, @e, @t)`,
      { s: this.id_sesion, e: emisor, t: String(texto).slice(0, 1000) });
  }

  /** Respuesta de contención (simula la IA). */
  static respuestaIA(emocion, nivel) {
    if (nivel === 'CRITICO') {
      return 'Lo que me cuentas es muy importante y quiero que estés a salvo. Ya avisé a tu psicólogo para que se comunique contigo. ' +
        'Si sientes que puedes hacerte daño ahora, llama a la Línea de la Vida: 800 911 2000 (24 h, gratuita) o al 911.';
    }
    if (nivel === 'ALTO') {
      return RESPUESTAS[emocion] + ' Avisé a tu psicólogo para que esté al pendiente de ti. Si lo necesitas, la Línea de la Vida está disponible: 800 911 2000.';
    }
    return RESPUESTAS[emocion] || RESPUESTAS.Neutral;
  }

  async obtenerDatosSesion() {
    const mensajes = await q(`SELECT TOP 30 emisor, texto, fecha_hora FROM mensaje WHERE id_sesion = @s ORDER BY fecha_hora DESC, id_mensaje DESC`,
      { s: this.id_sesion });
    return { ...this, mensajes: mensajes.reverse() };
  }

  static async porId(idSesion) {
    const fila = await uno(`SELECT * FROM sesion WHERE id_sesion = @s`, { s: idSesion });
    return fila ? new Sesion(fila) : null;
  }

  async finalizarSesion() {
    await q(`UPDATE sesion SET estado = 'FINALIZADA', fecha_fin = SYSDATETIME() WHERE id_sesion = @s`, { s: this.id_sesion });
  }
}

Sesion.NIVELES = NIVELES;
module.exports = Sesion;
