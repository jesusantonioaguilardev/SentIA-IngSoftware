// Clases Instrumento, GuiaEvaluacion y Resultado (Secuencia 2 del entregable 06, CU-15).
const { q, uno, transaccion } = require('../db');

class Instrumento {
  constructor(fila) { Object.assign(this, fila); }

  static async porId(id) {
    const f = await uno(`SELECT * FROM instrumento WHERE id_instrumento = @i`, { i: id });
    return f ? new Instrumento(f) : null;
  }

  /** calcularPuntaje(valores): aplica el método de calificación del instrumento. */
  calcularPuntaje(valores) {
    const metodo = (this.metodo_calificacion || '').toLowerCase();
    if (metodo.includes('conteo')) return valores.filter(v => v > 0).length; // TQ: síntomas presentes
    return valores.reduce((s, v) => s + v, 0);                                // BAI, HAM-A, TOP-8: suma
  }

  async obtenerGuias() {
    const filas = await q(`SELECT * FROM guia_evaluacion WHERE id_instrumento = @i ORDER BY puntaje_min`, { i: this.id_instrumento });
    return filas.map(f => new GuiaEvaluacion(f));
  }
}

class GuiaEvaluacion {
  constructor(fila) { Object.assign(this, fila); }
  perteneceARango(puntaje) { return puntaje >= this.puntaje_min && puntaje <= this.puntaje_max; }
  obtenerCategoria() { return this.categoria; }
  obtenerDescripcion() { return this.descripcion; }
  obtenerRecomendacion() { return this.recomendacion; }
}

class Resultado {
  constructor(datos) { Object.assign(this, datos); }

  registrarPuntaje(puntaje) { this.puntaje = puntaje; }

  registrarInterpretacion(guia, revisionManual) {
    this.guia = guia;
    this.interpretacion = revisionManual
      ? `Requiere revisión manual: el puntaje ${this.puntaje} queda fuera de los rangos de la guía.`
      : `${guia.obtenerDescripcion()} Puntaje ${this.puntaje} (${guia.obtenerCategoria()}). ${guia.obtenerRecomendacion()}`;
  }

  detectarRiesgo() { return !!(this.guia && this.guia.indica_riesgo); }

  /**
   * CU-15 Procesar Resultados: calcula, interpreta y guarda; devuelve el resultado.
   * Debe tardar menos de 3 s (RNF rendimiento).
   */
  static async procesar(idEvaluacion) {
    const inicio = Date.now();
    const ev = await uno(`SELECT * FROM evaluacion WHERE id_evaluacion = @e`, { e: idEvaluacion });
    const instrumento = await Instrumento.porId(ev.id_instrumento);
    const valores = (await q(`SELECT valor FROM respuesta WHERE id_evaluacion = @e`, { e: idEvaluacion })).map(r => r.valor);

    const resultado = new Resultado({ idEvaluacion, instrumento });
    resultado.registrarPuntaje(instrumento.calcularPuntaje(valores));

    const guias = await instrumento.obtenerGuias();
    if (!guias.length) throw Object.assign(new Error('El instrumento no tiene guía de evaluación.'), { status: 409 });
    let guia = guias.find(g => g.perteneceARango(resultado.puntaje));
    const revisionManual = !guia; // CU-15 4A
    if (!guia) guia = resultado.puntaje < guias[0].puntaje_min ? guias[0] : guias[guias.length - 1];
    resultado.registrarInterpretacion(guia, revisionManual);

    const fila = await transaccion(async tx => {
      await q(`UPDATE evaluacion SET estado = 'COMPLETADA', fecha_completada = SYSDATETIME() WHERE id_evaluacion = @e`, { e: idEvaluacion }, tx);
      return uno(`INSERT INTO resultado (id_evaluacion, id_guia, puntaje, interpretacion, retroalimentacion_autorizada)
                  OUTPUT INSERTED.id_resultado VALUES (@e, @g, @p, @i, 0)`,
        { e: idEvaluacion, g: guia.id_guia, p: resultado.puntaje, i: resultado.interpretacion.slice(0, 500) }, tx);
    });
    resultado.id = fila.id_resultado;
    resultado.ms = Date.now() - inicio;
    resultado.revisionManual = revisionManual;
    return resultado;
  }

  /** Último resultado del paciente; lo usa la Secuencia 1 (Alerta → Resultado.detectarRiesgo()). */
  static async ultimoDelPaciente(idPaciente) {
    const f = await uno(`SELECT TOP 1 r.puntaje, g.categoria, g.indica_riesgo, i.siglas
                         FROM resultado r JOIN evaluacion e ON e.id_evaluacion = r.id_evaluacion
                         JOIN guia_evaluacion g ON g.id_guia = r.id_guia JOIN instrumento i ON i.id_instrumento = e.id_instrumento
                         WHERE e.id_paciente = @p ORDER BY r.fecha_resultado DESC`, { p: idPaciente });
    if (!f) return null;
    const r = new Resultado({ puntaje: f.puntaje, guia: { indica_riesgo: f.indica_riesgo }, categoria: f.categoria, siglas: f.siglas });
    return r;
  }
}

module.exports = { Instrumento, GuiaEvaluacion, Resultado };
