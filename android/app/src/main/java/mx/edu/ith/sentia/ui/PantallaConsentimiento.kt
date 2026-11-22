package mx.edu.ith.sentia.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import mx.edu.ith.sentia.data.Api
import mx.edu.ith.sentia.data.ConsentimientoInformado
import mx.edu.ith.sentia.data.ErrorDeApi

/** GUI-5.1 Consentimiento informado (CU-09). Sin firma no se puede usar el chat (CU-10 2A). */
@Composable
fun PantallaConsentimiento(alFirmar: () -> Unit, alSalir: () -> Unit) {
    val alcance = rememberCoroutineScope()
    var datos by remember { mutableStateOf<ConsentimientoInformado?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var acepto by remember { mutableStateOf(false) }
    var nombre by remember { mutableStateOf(Api.sesion?.let { "${it.nombre} ${it.apellidos}" } ?: "") }
    val trazos = remember { mutableStateListOf<List<Offset>>() }
    var trazoActual by remember { mutableStateOf<List<Offset>>(emptyList()) }
    var enviando by remember { mutableStateOf(false) }
    var avisoRechazo by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) {
        try { datos = Api.consentimiento() } catch (e: ErrorDeApi) { error = e.message }
    }

    Column(Modifier.fillMaxSize().imePadding()) {
        Encabezado("Consentimiento informado", "Léelo con calma antes de empezar")
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            error?.let { CajaError(it) }
            val d = datos
            if (d == null && error == null) Text("Cargando términos…")
            if (d != null) {
                Card(colors = CardDefaults.cardColors(containerColor = Color.White)) {
                    Text(d.texto, Modifier.padding(16.dp), style = MaterialTheme.typography.bodyMedium)
                }
                Text("Versión ${d.version} de los términos y aviso de privacidad", style = MaterialTheme.typography.labelSmall, color = Colores.TextoApoyo)
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Checkbox(checked = acepto, onCheckedChange = { acepto = it })
                    Text("He leído y acepto el consentimiento informado y el aviso de privacidad.")
                }
                OutlinedTextField(nombre, { nombre = it }, label = { Text("Nombre completo *") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                Text("Firma con tu dedo en el recuadro *", fontWeight = FontWeight.SemiBold)
                Box(
                    Modifier.fillMaxWidth().height(150.dp).background(Color.White, RoundedCornerShape(10.dp))
                        .border(1.dp, if (trazos.isEmpty()) Colores.Gris else Colores.Verde, RoundedCornerShape(10.dp))
                        .pointerInput(Unit) {
                            detectDragGestures(
                                onDragStart = { trazoActual = listOf(it) },
                                onDrag = { cambio, _ -> trazoActual = trazoActual + cambio.position },
                                onDragEnd = { if (trazoActual.size > 1) trazos.add(trazoActual); trazoActual = emptyList() },
                            )
                        },
                ) {
                    Canvas(Modifier.fillMaxSize()) {
                        (trazos + listOf(trazoActual)).forEach { t ->
                            t.zipWithNext().forEach { (a, b) -> drawLine(Colores.Texto, a, b, strokeWidth = 5f, cap = StrokeCap.Round) }
                        }
                    }
                    if (trazos.isEmpty() && trazoActual.isEmpty()) Text("Firma aquí", Modifier.align(Alignment.Center), color = Colores.Gris)
                }
                TextButton(onClick = { trazos.clear() }) { Text("Borrar firma") }

                BotonPrincipal(if (enviando) "Guardando…" else "Aceptar y firmar", Modifier.fillMaxWidth(),
                    habilitado = !enviando && acepto && nombre.trim().length >= 3 && trazos.isNotEmpty()) {
                    enviando = true
                    alcance.launch {
                        try {
                            Api.firmarConsentimiento(true, nombre.trim())
                            Api.sesion = Api.sesion?.copy(consentimiento = "ACEPTADO")
                            alFirmar()
                        } catch (e: ErrorDeApi) { error = e.message } finally { enviando = false }
                    }
                }
                OutlinedButton(onClick = {
                    alcance.launch {
                        try { avisoRechazo = Api.firmarConsentimiento(false, "").mensaje } catch (e: ErrorDeApi) { error = e.message }
                    }
                }, modifier = Modifier.fillMaxWidth().height(48.dp)) { Text("No acepto") }
                Text("Si estás en crisis, llama ahora:", color = Colores.Rojo, fontWeight = FontWeight.SemiBold)
                LineasDeApoyo()
            }
        }
    }

    // CU-09 4A: rechazo del consentimiento
    avisoRechazo?.let { msg ->
        AlertDialog(
            onDismissRequest = { avisoRechazo = null },
            title = { Text("No podemos iniciar sin tu consentimiento") },
            text = { Text(msg) },
            confirmButton = { TextButton(onClick = { avisoRechazo = null }) { Text("Volver a leer") } },
            dismissButton = { TextButton(onClick = { avisoRechazo = null; alcance.launch { Api.cerrarSesion(); alSalir() } }) { Text("Salir") } },
        )
    }
}
