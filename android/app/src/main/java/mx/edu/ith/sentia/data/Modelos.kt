package mx.edu.ith.sentia.data

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

// Modelos de datos que viajan entre la app y la API. Sus campos siguen
// los atributos del diagrama de clases (entregable 07) y la lista de datos (10).

@Serializable
data class SesionUsuario(
    val token: String,
    val rol: String,
    val idPaciente: Int? = null,
    val nombre: String = "",
    val apellidos: String = "",
    val consentimiento: String = "PENDIENTE",
)

@Serializable
data class EvaluacionResumen(val idEvaluacion: Int, val siglas: String, val nombre: String, val fechaLimite: String)

@Serializable
data class Inicio(
    val nombre: String,
    val consentimiento: String,
    val evaluacionesPendientes: Int = 0,
    val animoHoy: Int? = null,
    val avisosSinLeer: Int = 0,
    val siguienteEvaluacion: EvaluacionResumen? = null,
)

/** ConsentimientoInformado: mostrarTerminos() */
@Serializable
data class ConsentimientoInformado(val version: String, val texto: String, val estado: String, val fechaFirma: String? = null)

@Serializable
data class RespuestaConsentimiento(val estado: String, val mensaje: String)

/** Mensaje del chat (emisor PACIENTE o SENTIA). */
@Serializable
data class Mensaje(val emisor: String, val texto: String, @SerialName("fecha_hora") val fechaHora: String? = null)

@Serializable
data class Conversacion(val idSesion: Int, val mensajes: List<Mensaje>)

@Serializable
data class LineaApoyo(val nombre: String, val telefono: String)

@Serializable
data class RespuestaChat(
    val respuesta: String,
    val emocion: String,
    val nivelRiesgo: String,
    val alertaGenerada: Boolean,
    val lineasApoyo: List<LineaApoyo> = emptyList(),
)

@Serializable
data class RespuestaEmergencia(val idAlerta: Int, val mensaje: String, val lineasApoyo: List<LineaApoyo>)

/** Evaluacion: aplicación de un instrumento a un paciente (estado PENDIENTE / INICIADA / COMPLETADA). */
@Serializable
data class Evaluacion(
    val idEvaluacion: Int,
    val siglas: String,
    val nombre: String,
    val estado: String,
    val fechaAsignacion: String? = null,
    val fechaLimite: String? = null,
    val fechaCompletada: String? = null,
    val mensaje: String? = null,
    val respondidas: Int = 0,
    val total: Int = 0,
)

/** Pregunta (reactivo) con el valor ya guardado si existe. */
@Serializable
data class Pregunta(
    val idPregunta: Int,
    val numero: Int,
    val texto: String,
    val tipoRespuesta: String,
    val minimo: Int,
    val maximo: Int,
    val valor: Int? = null,
    val opciones: List<String> = emptyList(),
)

@Serializable
data class EvaluacionDetalle(val idEvaluacion: Int, val siglas: String, val nombre: String, val estado: String, val preguntas: List<Pregunta>)

@Serializable
data class RespuestaFinalizar(val idResultado: Int, val enRevision: Boolean, val ms: Int = 0, val mensaje: String)

/** Resultado.mostrarRetroalimentacion(): solo lo que el paciente puede ver. */
@Serializable
data class Retroalimentacion(
    val idResultado: Int,
    val siglas: String,
    val nombre: String,
    val fecha: String? = null,
    val autorizado: Boolean,
    val puntaje: Int? = null,
    val categoria: String? = null,
    val mensaje: String,
    val recomendacion: String? = null,
)

@Serializable
data class PuntoAnimo(val fecha: String, val valor: Double)

@Serializable
data class Progreso(val resultados: List<Retroalimentacion>, val animo: List<PuntoAnimo>, val recomendacionDelDia: String)

@Serializable
data class Notificacion(val idNotificacion: Int, val tipo: String, val mensaje: String, val fecha: String? = null, val leida: Boolean)

@Serializable
data class ErrorApi(val error: String? = null, val codigo: String? = null)
