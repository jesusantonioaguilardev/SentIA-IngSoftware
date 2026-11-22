package mx.edu.ith.sentia.data

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import mx.edu.ith.sentia.BuildConfig
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.util.concurrent.TimeUnit

/** Error que devuelve la API (status HTTP + mensaje en español). */
class ErrorDeApi(val status: Int, override val message: String, val codigo: String? = null) : Exception(message)

/**
 * Cliente de la API de SentIA. El token se guarda solo en memoria;
 * la dirección del servidor se recuerda para poder usar un celular físico.
 */
object Api {
    private const val PREFS = "sentia"
    private val tipoJson = "application/json; charset=utf-8".toMediaType()
    val json = Json { ignoreUnknownKeys = true; explicitNulls = false; coerceInputValues = true }

    private val cliente = OkHttpClient.Builder()
        .connectTimeout(6, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .build()

    var servidor: String = BuildConfig.SERVIDOR_POR_DEFECTO
        private set
    var sesion: SesionUsuario? = null
    /** Se llama cuando el servidor responde 401 (sesión vencida). */
    var alExpirar: () -> Unit = {}

    fun cargar(ctx: Context) {
        servidor = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString("servidor", BuildConfig.SERVIDOR_POR_DEFECTO) ?: BuildConfig.SERVIDOR_POR_DEFECTO
    }

    fun cambiarServidor(ctx: Context, url: String) {
        servidor = url.trim().trimEnd('/').ifBlank { BuildConfig.SERVIDOR_POR_DEFECTO }
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("servidor", servidor).apply()
    }

    suspend fun pedir(metodo: String, ruta: String, cuerpo: JsonObject? = null): String = withContext(Dispatchers.IO) {
        val req = Request.Builder().url("$servidor/api$ruta").apply {
            sesion?.let { header("Authorization", "Bearer ${it.token}") }
            val body = (cuerpo ?: JsonObject(emptyMap())).toString().toRequestBody(tipoJson)
            when (metodo) {
                "GET" -> get()
                else -> method(metodo, body)
            }
        }.build()
        val resp = try {
            cliente.newCall(req).execute()
        } catch (e: IOException) {
            throw ErrorDeApi(0, "No hay conexión con el servidor de SentIA. Revisa tu Internet.", "SIN_CONEXION")
        }
        resp.use {
            val texto = it.body?.string().orEmpty()
            if (!it.isSuccessful) {
                val err = runCatching { json.decodeFromString<ErrorApi>(texto) }.getOrNull()
                if (it.code == 401 && sesion != null) withContext(Dispatchers.Main) { alExpirar() }
                throw ErrorDeApi(it.code, err?.error ?: "Error del servidor (${it.code}).", err?.codigo)
            }
            texto
        }
    }

    suspend inline fun <reified T> get(ruta: String): T = json.decodeFromString(pedir("GET", ruta))
    suspend inline fun <reified T> post(ruta: String, cuerpo: JsonObject = JsonObject(emptyMap())): T = json.decodeFromString(pedir("POST", ruta, cuerpo))
    suspend fun put(ruta: String, cuerpo: JsonObject) { pedir("PUT", ruta, cuerpo) }

    // ---------- Operaciones (contrato de la API) ----------
    suspend fun ping(): Boolean = runCatching { pedir("GET", "/ping"); true }.getOrDefault(false)

    suspend fun iniciarSesion(correo: String, contrasena: String): SesionUsuario {
        val s: SesionUsuario = post("/auth/login", buildJsonObject {
            put("correo", correo); put("contrasena", contrasena); put("cliente", "app")
        })
        sesion = s
        return s
    }

    suspend fun cerrarSesion() {
        runCatching { pedir("POST", "/auth/logout") }
        sesion = null
    }

    suspend fun inicio(): Inicio = get("/paciente/inicio")
    suspend fun registrarAnimo(valor: Int) { pedir("POST", "/paciente/animo", buildJsonObject { put("valor", valor) }) }
    suspend fun consentimiento(): ConsentimientoInformado = get("/paciente/consentimiento")
    suspend fun firmarConsentimiento(acepta: Boolean, firma: String): RespuestaConsentimiento =
        post("/paciente/consentimiento", buildJsonObject { put("acepta", acepta); put("firma", firma) })
    suspend fun conversacion(): Conversacion = get("/paciente/chat")
    suspend fun enviarMensaje(texto: String): RespuestaChat = post("/paciente/chat", buildJsonObject { put("texto", texto) })
    suspend fun solicitarEmergencia(): RespuestaEmergencia = post("/paciente/emergencia")
    suspend fun emergenciaCancelada() { runCatching { pedir("POST", "/paciente/emergencia/cancelada") } }
    suspend fun evaluaciones(): List<Evaluacion> = get("/paciente/evaluaciones")
    suspend fun evaluacion(id: Int): EvaluacionDetalle = get("/paciente/evaluaciones/$id")
    suspend fun registrarValor(idEvaluacion: Int, idPregunta: Int, valor: Int) =
        put("/paciente/evaluaciones/$idEvaluacion/respuestas", buildJsonObject { put("idPregunta", idPregunta); put("valor", valor) })
    suspend fun finalizar(idEvaluacion: Int): RespuestaFinalizar = post("/paciente/evaluaciones/$idEvaluacion/finalizar")
    suspend fun progreso(): Progreso = get("/paciente/progreso")
    suspend fun notificaciones(): List<Notificacion> = get("/paciente/notificaciones")
    suspend fun marcarAvisosLeidos() { runCatching { pedir("POST", "/paciente/notificaciones/leer") } }
}
