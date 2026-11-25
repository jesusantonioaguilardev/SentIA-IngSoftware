package mx.edu.ith.sentia.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material.icons.outlined.SentimentDissatisfied
import androidx.compose.material.icons.outlined.SentimentNeutral
import androidx.compose.material.icons.outlined.SentimentSatisfied
import androidx.compose.material.icons.outlined.SentimentVeryDissatisfied
import androidx.compose.material.icons.outlined.SentimentVerySatisfied
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import mx.edu.ith.sentia.data.Api
import mx.edu.ith.sentia.data.ErrorDeApi
import mx.edu.ith.sentia.data.Inicio

/** Escala de ánimo 1–5 con los íconos de sentimiento de Material Design. */
val ANIMOS: List<Pair<ImageVector, String>> = listOf(
    Icons.Outlined.SentimentVeryDissatisfied to "Muy mal",
    Icons.Outlined.SentimentDissatisfied to "Mal",
    Icons.Outlined.SentimentNeutral to "Regular",
    Icons.Outlined.SentimentSatisfied to "Bien",
    Icons.Outlined.SentimentVerySatisfied to "Muy bien",
)

/** GUI-5.2 Inicio de la app: estado de ánimo, evaluación pendiente, chat y botón de emergencia. */
@Composable
fun PantallaInicio(irA: (Pantalla) -> Unit, pedirEmergencia: () -> Unit, avisosSinLeer: Int, leerAvisos: () -> Unit) {
    val alcance = rememberCoroutineScope()
    var datos by remember { mutableStateOf<Inicio?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var animo by remember { mutableStateOf<Int?>(null) }

    suspend fun cargar() {
        try { datos = Api.inicio().also { animo = it.animoHoy }; error = null } catch (e: ErrorDeApi) { error = e.message }
    }
    LaunchedEffect(avisosSinLeer) { cargar() }

    Column(Modifier.fillMaxSize()) {
        Encabezado("Hola, ${datos?.nombre ?: Api.sesion?.nombre ?: ""}", "¿Cómo te sientes hoy?")
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            error?.let { CajaError(it) { alcance.launch { cargar() } } }

            // Estado de ánimo (registro_animo)
            Card(colors = CardDefaults.cardColors(containerColor = Color.White)) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("Mi estado de ánimo", style = MaterialTheme.typography.titleMedium)
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        ANIMOS.forEachIndexed { i, (icono, nombre) ->
                            val valor = i + 1
                            val elegido = animo == valor
                            Column(horizontalAlignment = Alignment.CenterHorizontally,
                                modifier = Modifier.clip(RoundedCornerShape(12.dp))
                                    .background(if (elegido) Colores.MoradoClaro else Color.Transparent)
                                    .clickable {
                                        animo = valor
                                        alcance.launch { runCatching { Api.registrarAnimo(valor) } }
                                    }
                                    .semantics { contentDescription = nombre }
                                    .padding(horizontal = 6.dp, vertical = 8.dp)) {
                                Icon(icono, contentDescription = null, modifier = Modifier.size(36.dp),
                                    tint = if (elegido) Colores.Morado else Colores.TextoApoyo)
                                Text(nombre, style = MaterialTheme.typography.labelSmall,
                                    color = if (elegido) Colores.MoradoOscuro else Colores.TextoApoyo,
                                    fontWeight = if (elegido) FontWeight.SemiBold else FontWeight.Normal)
                            }
                        }
                    }
                    if (animo != null) Text("Gracias, lo registré. Tu psicólogo podrá ver cómo evolucionas.", color = Colores.Verde, style = MaterialTheme.typography.bodyMedium)
                }
            }

            if (avisosSinLeer > 0) {
                Card(colors = CardDefaults.cardColors(containerColor = Colores.NaranjaClaro), modifier = Modifier.clickable { leerAvisos() }) {
                    Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text("Tienes $avisosSinLeer aviso(s) nuevo(s) de tu psicólogo.", color = Colores.Naranja, modifier = Modifier.weight(1f), fontWeight = FontWeight.SemiBold)
                        TextButton(onClick = leerAvisos) { Text("Entendido") }
                    }
                }
            }

            // Evaluación pendiente
            val sig = datos?.siguienteEvaluacion
            Card(colors = CardDefaults.cardColors(containerColor = Color.White)) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Evaluaciones pendientes: ${datos?.evaluacionesPendientes ?: 0}", style = MaterialTheme.typography.titleMedium)
                    if (sig != null) {
                        Text("${sig.siglas} · ${sig.nombre}")
                        Text("Fecha límite: ${fecha(sig.fechaLimite)}", color = Colores.Naranja, style = MaterialTheme.typography.bodyMedium)
                        BotonPrincipal("Responder ahora", Modifier.fillMaxWidth()) { irA(Pantalla.Responder(sig.idEvaluacion)) }
                    } else Text("No tienes evaluaciones por responder. ¡Bien hecho!", color = Colores.TextoApoyo)
                }
            }

            Card(colors = CardDefaults.cardColors(containerColor = Colores.MoradoClaro), modifier = Modifier.clickable { irA(Pantalla.Principal(Pestana.Chat)) }) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text("Hablar con SentIA", style = MaterialTheme.typography.titleMedium, color = Colores.MoradoOscuro)
                    Text("Cuéntame cómo te sientes. Estoy aquí entre tus sesiones.", color = Colores.Texto)
                }
            }

            // CU-16 Botón de emergencia
            Button(
                onClick = pedirEmergencia,
                colors = ButtonDefaults.buttonColors(containerColor = Colores.Rojo),
                shape = RoundedCornerShape(16.dp),
                modifier = Modifier.fillMaxWidth().heightIn(min = 72.dp),
            ) {
                Box(Modifier.size(36.dp).clip(CircleShape).background(Color.White.copy(alpha = .2f)), contentAlignment = Alignment.Center) {
                    Icon(Icons.Filled.Warning, contentDescription = null, tint = Color.White)
                }
                Column(Modifier.padding(start = 12.dp).weight(1f)) {
                    Text("Botón de emergencia", fontWeight = FontWeight.Bold, fontSize = 18.sp)
                    Text("Pide apoyo inmediato a tu psicólogo", style = MaterialTheme.typography.bodyMedium)
                }
            }
        }
    }
}
