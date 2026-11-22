package mx.edu.ith.sentia.ui

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.Face
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.Button
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.ContextCompat
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import mx.edu.ith.sentia.data.Api
import mx.edu.ith.sentia.data.ErrorDeApi
import mx.edu.ith.sentia.data.RespuestaEmergencia

/** Pantallas de la app (claves GUI del entregable 12). */
sealed interface Pantalla {
    data object Login : Pantalla                                         // GUI-0.3
    data object Consentimiento : Pantalla                                // GUI-5.1
    data class Principal(val pestana: Pestana = Pestana.Inicio) : Pantalla
    data class Responder(val idEvaluacion: Int) : Pantalla               // GUI-6.2
    data class Emergencia(val respuesta: RespuestaEmergencia?) : Pantalla // GUI-5.4 (null = sin conexión)
}

/** Barra de navegación inferior con 5 secciones. */
enum class Pestana(val titulo: String, val icono: ImageVector) {
    Inicio("Inicio", Icons.Filled.Home),                                 // GUI-5.2
    Chat("SentIA", Icons.Filled.Face),                                   // GUI-5.3
    Evaluaciones("Pruebas", Icons.AutoMirrored.Filled.List),             // GUI-6.1 Mis evaluaciones
    Progreso("Progreso", Icons.Filled.Star),                             // GUI-7.1 Mi progreso
    Perfil("Perfil", Icons.Filled.Person),                               // GUI-8.2
}

@Composable
fun AppSentIA() {
    TemaSentIA {
        var pantalla by remember { mutableStateOf<Pantalla>(Pantalla.Login) }
        Api.alExpirar = { pantalla = Pantalla.Login }

        val irA: (Pantalla) -> Unit = { pantalla = it }
        BackHandler(enabled = pantalla !is Pantalla.Login && pantalla != Pantalla.Principal(Pestana.Inicio)) {
            pantalla = when (val p = pantalla) {
                is Pantalla.Responder -> Pantalla.Principal(Pestana.Evaluaciones)
                is Pantalla.Principal -> Pantalla.Principal(Pestana.Inicio)
                is Pantalla.Emergencia -> Pantalla.Principal(Pestana.Inicio)
                else -> p
            }
        }

        when (val p = pantalla) {
            Pantalla.Login -> PantallaLogin(alEntrar = { s ->
                pantalla = if (s.consentimiento == "ACEPTADO") Pantalla.Principal() else Pantalla.Consentimiento
            })
            Pantalla.Consentimiento -> PantallaConsentimiento(
                alFirmar = { pantalla = Pantalla.Principal() },
                alSalir = { pantalla = Pantalla.Login },
            )
            is Pantalla.Principal -> Principal(p.pestana, irA)
            is Pantalla.Responder -> PantallaResponder(p.idEvaluacion, alTerminar = { pantalla = Pantalla.Principal(Pestana.Evaluaciones) })
            is Pantalla.Emergencia -> PantallaEmergencia(p.respuesta, alVolver = { pantalla = Pantalla.Principal(Pestana.Inicio) })
        }
    }
}

@Composable
private fun Principal(pestana: Pestana, irA: (Pantalla) -> Unit) {
    val ctx = LocalContext.current
    val alcance = rememberCoroutineScope()
    val snackbar = remember { SnackbarHostState() }
    var avisosSinLeer by remember { mutableIntStateOf(0) }
    var confirmarEmergencia by remember { mutableStateOf(false) }
    var enviandoEmergencia by remember { mutableStateOf(false) }

    // Permiso de notificaciones (Android 13+)
    val pedirPermiso = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { }
    LaunchedEffect(Unit) {
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) pedirPermiso.launch(Manifest.permission.POST_NOTIFICATIONS)
    }

    // Consulta de avisos cada 10 s (simula las notificaciones push)
    LaunchedEffect(Unit) {
        val vistos = mutableSetOf<Int>()
        var primera = true
        while (true) {
            runCatching { Api.notificaciones() }.onSuccess { lista ->
                val noLeidos = lista.filter { !it.leida }
                avisosSinLeer = noLeidos.size
                noLeidos.filter { it.idNotificacion !in vistos }.forEach { n ->
                    if (!primera) {
                        Avisos.mostrar(ctx, n.idNotificacion, Avisos.titulo(n.tipo), n.mensaje)
                        launch { snackbar.showSnackbar(n.mensaje) }
                    }
                    vistos += n.idNotificacion
                }
                primera = false
            }
            delay(10_000)
        }
    }

    val pedirEmergencia: () -> Unit = { confirmarEmergencia = true }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbar) },
        bottomBar = {
            NavigationBar(containerColor = Colores.MoradoClaro) {
                Pestana.entries.forEach { p ->
                    NavigationBarItem(
                        selected = p == pestana,
                        onClick = { irA(Pantalla.Principal(p)) },
                        icon = {
                            if (p == Pestana.Inicio && avisosSinLeer > 0) BadgedBox(badge = { Badge { Text("$avisosSinLeer") } }) { Icon(p.icono, null) }
                            else Icon(p.icono, null)
                        },
                        label = { Text(p.titulo, maxLines = 1, style = MaterialTheme.typography.labelSmall) },
                        colors = NavigationBarItemDefaults.colors(selectedIconColor = Colores.Azul, selectedTextColor = Colores.Azul, indicatorColor = Colores.AzulClaro),
                    )
                }
            }
        },
    ) { relleno ->
        // consumeWindowInsets: el teclado no suma su alto encima de la barra inferior.
        Box(Modifier.padding(relleno).consumeWindowInsets(relleno)) {
            when (pestana) {
                Pestana.Inicio -> PantallaInicio(irA = irA, pedirEmergencia = pedirEmergencia, avisosSinLeer = avisosSinLeer,
                    leerAvisos = { alcance.launch { Api.marcarAvisosLeidos(); avisosSinLeer = 0 } })
                Pestana.Chat -> PantallaChat(irA = irA, pedirEmergencia = pedirEmergencia)
                Pestana.Evaluaciones -> PantallaEvaluaciones(alAbrir = { irA(Pantalla.Responder(it)) })
                Pestana.Progreso -> PantallaProgreso()
                Pestana.Perfil -> PantallaPerfil(alSalir = { alcance.launch { Api.cerrarSesion(); irA(Pantalla.Login) } })
            }
        }
    }

    // GUI-5.4 Confirmar solicitud de emergencia (CU-16 pasos 2–3)
    if (confirmarEmergencia) {
        AlertDialog(
            onDismissRequest = { if (!enviandoEmergencia) { confirmarEmergencia = false; alcance.launch { Api.emergenciaCancelada() } } },
            title = { Text("¿Necesitas ayuda ahora?") },
            text = { Text("Se enviará una alerta CRÍTICA a tu psicólogo para que se comunique contigo de inmediato.") },
            confirmButton = {
                Button(
                    enabled = !enviandoEmergencia,
                    colors = ButtonDefaults.buttonColors(containerColor = Colores.Rojo),
                    onClick = {
                        enviandoEmergencia = true
                        alcance.launch {
                            val r = try { Api.solicitarEmergencia() } catch (e: ErrorDeApi) { null } // CU-16 4A sin conexión
                            enviandoEmergencia = false; confirmarEmergencia = false
                            irA(Pantalla.Emergencia(r))
                        }
                    },
                ) { Text(if (enviandoEmergencia) "Enviando…" else "Sí, pedir ayuda") }
            },
            dismissButton = {
                TextButton(enabled = !enviandoEmergencia, onClick = { confirmarEmergencia = false; alcance.launch { Api.emergenciaCancelada() } }) { Text("Cancelar") }
            },
        )
    }
}
