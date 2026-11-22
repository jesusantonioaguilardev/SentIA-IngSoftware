package mx.edu.ith.sentia.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import mx.edu.ith.sentia.data.Api
import mx.edu.ith.sentia.data.ErrorDeApi
import mx.edu.ith.sentia.data.LineaApoyo
import mx.edu.ith.sentia.data.Mensaje

/** GUI-5.3 Chat con SentIA (CU-10). Cada mensaje se analiza para detectar riesgo (Secuencia 1). */
@Composable
fun PantallaChat(irA: (Pantalla) -> Unit, pedirEmergencia: () -> Unit) {
    val alcance = rememberCoroutineScope()
    val mensajes = remember { mutableStateListOf<Mensaje>() }
    var texto by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var enviando by remember { mutableStateOf(false) }
    var lineasCrisis by remember { mutableStateOf<List<LineaApoyo>>(emptyList()) }
    val lista = rememberLazyListState()

    LaunchedEffect(Unit) {
        try {
            mensajes.clear(); mensajes.addAll(Api.conversacion().mensajes)
        } catch (e: ErrorDeApi) {
            if (e.codigo == "CONSENTIMIENTO_PENDIENTE") irA(Pantalla.Consentimiento) // CU-10 2A
            else error = e.message
        }
    }
    LaunchedEffect(mensajes.size, enviando) { if (mensajes.isNotEmpty()) lista.animateScrollToItem(mensajes.size - 1 + if (enviando) 1 else 0) }

    fun enviar() {
        val t = texto.trim()
        if (t.isEmpty() || enviando) return
        mensajes.add(Mensaje("PACIENTE", t)); texto = ""; enviando = true; error = null
        alcance.launch {
            try {
                val r = Api.enviarMensaje(t)
                mensajes.add(Mensaje("SENTIA", r.respuesta))
                if (r.alertaGenerada) lineasCrisis = r.lineasApoyo
            } catch (e: ErrorDeApi) { error = e.message } finally { enviando = false }
        }
    }

    Column(Modifier.fillMaxSize().imePadding()) {
        Encabezado("SentIA", "Conversación privada · tus mensajes son confidenciales") {
            IconButton(onClick = pedirEmergencia, colors = IconButtonDefaults.iconButtonColors(containerColor = Colores.Rojo, contentColor = Color.White)) {
                Icon(Icons.Filled.Warning, contentDescription = "Botón de emergencia")
            }
        }
        if (lineasCrisis.isNotEmpty()) {
            Card(colors = CardDefaults.cardColors(containerColor = Colores.RojoClaro), shape = RoundedCornerShape(0.dp)) {
                Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text("Tu psicólogo ya fue avisado. Si estás en peligro, llama ahora:", color = Colores.Rojo, fontWeight = FontWeight.SemiBold)
                    LineasDeApoyo(lineasCrisis, compacto = true)
                }
            }
        }
        LazyColumn(Modifier.weight(1f).fillMaxWidth(), state = lista, contentPadding = PaddingValues(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(mensajes) { m -> Burbuja(m) }
            if (enviando) item { Burbuja(Mensaje("SENTIA", "SentIA está escribiendo…")) }
        }
        error?.let { Text(it, color = Colores.Rojo, modifier = Modifier.padding(horizontal = 12.dp)) }
        Row(Modifier.fillMaxWidth().background(Color.White).padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(
                value = texto, onValueChange = { if (it.length <= 1000) texto = it },
                placeholder = { Text("Escribe cómo te sientes…") }, modifier = Modifier.weight(1f), maxLines = 4,
                supportingText = { if (texto.length > 900) Text("${texto.length}/1000") },
            )
            FilledIconButton(onClick = { enviar() }, enabled = texto.isNotBlank() && !enviando, modifier = Modifier.padding(start = 8.dp),
                colors = IconButtonDefaults.filledIconButtonColors(containerColor = Colores.Morado)) {
                Icon(Icons.AutoMirrored.Filled.Send, contentDescription = "Enviar")
            }
        }
    }
}

@Composable
private fun Burbuja(m: Mensaje) {
    val propio = m.emisor == "PACIENTE"
    Row(Modifier.fillMaxWidth(), horizontalArrangement = if (propio) Arrangement.End else Arrangement.Start) {
        Text(
            m.texto,
            modifier = Modifier.widthIn(max = 290.dp).clip(RoundedCornerShape(14.dp))
                .background(if (propio) Colores.Morado else Color.White).padding(horizontal = 14.dp, vertical = 10.dp),
            color = if (propio) Color.White else Colores.Texto,
            style = MaterialTheme.typography.bodyLarge,
        )
    }
}
