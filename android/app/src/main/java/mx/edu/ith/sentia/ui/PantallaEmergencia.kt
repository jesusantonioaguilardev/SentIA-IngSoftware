package mx.edu.ith.sentia.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import mx.edu.ith.sentia.data.Api
import mx.edu.ith.sentia.data.ErrorDeApi
import mx.edu.ith.sentia.data.RespuestaEmergencia

/** Pantalla de contención tras pedir apoyo de emergencia (CU-16 paso 5 y flujo 4A). */
@Composable
fun PantallaEmergencia(respuestaInicial: RespuestaEmergencia?, alVolver: () -> Unit) {
    val alcance = rememberCoroutineScope()
    var respuesta by remember { mutableStateOf(respuestaInicial) }
    var reintentando by remember { mutableStateOf(false) }

    Column(Modifier.fillMaxSize().background(Colores.RojoClaro)) {
        Column(Modifier.fillMaxWidth().background(Colores.Rojo).statusBarsPadding().padding(20.dp)) {
            Text(if (respuesta != null) "Tu psicólogo ya fue avisado" else "Sin conexión", color = Color.White, style = MaterialTheme.typography.titleLarge)
            Text(if (respuesta != null) "Alerta crítica enviada" else "No pudimos enviar la alerta todavía", color = Color.White.copy(alpha = .9f))
        }
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).navigationBarsPadding().padding(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Card(colors = CardDefaults.cardColors(containerColor = Color.White)) {
                Text(
                    respuesta?.mensaje ?: "No hay Internet en este momento. Llama a uno de estos números ahora; intentaremos enviar la alerta a tu psicólogo en cuanto vuelva la conexión.",
                    Modifier.padding(16.dp), style = MaterialTheme.typography.bodyLarge,
                )
            }
            Card(colors = CardDefaults.cardColors(containerColor = Color.White)) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Mientras tanto, respira conmigo", fontWeight = FontWeight.Bold)
                    Text("1. Inhala por la nariz contando hasta 4.\n2. Sostén el aire contando hasta 4.\n3. Exhala despacio por la boca contando hasta 6.\n4. Repite cinco veces. Nombra 5 cosas que puedas ver a tu alrededor.")
                }
            }
            Text("Líneas de apoyo disponibles", fontWeight = FontWeight.Bold, color = Colores.Rojo)
            LineasDeApoyo(respuesta?.lineasApoyo ?: LINEAS_LOCALES)
            if (respuesta == null) {
                BotonPrincipal(if (reintentando) "Reintentando…" else "Reintentar enviar alerta", Modifier.fillMaxWidth(), habilitado = !reintentando) {
                    reintentando = true
                    alcance.launch {
                        respuesta = try { Api.solicitarEmergencia() } catch (e: ErrorDeApi) { null }
                        reintentando = false
                    }
                }
            }
            OutlinedButton(onClick = alVolver, modifier = Modifier.fillMaxWidth()) { Text("Volver al inicio") }
        }
    }
}
