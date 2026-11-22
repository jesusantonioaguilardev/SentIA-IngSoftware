package mx.edu.ith.sentia.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import mx.edu.ith.sentia.data.Api
import mx.edu.ith.sentia.data.ErrorDeApi
import mx.edu.ith.sentia.data.Evaluacion
import mx.edu.ith.sentia.data.EvaluacionDetalle
import mx.edu.ith.sentia.data.RespuestaFinalizar

/** GUI-6.1 Mis evaluaciones: pendientes, en curso y completadas. */
@Composable
fun PantallaEvaluaciones(alAbrir: (Int) -> Unit) {
    var lista by remember { mutableStateOf<List<Evaluacion>?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    val alcance = rememberCoroutineScope()
    suspend fun cargar() { try { lista = Api.evaluaciones(); error = null } catch (e: ErrorDeApi) { error = e.message } }
    LaunchedEffect(Unit) { cargar() }

    Column(Modifier.fillMaxSize()) {
        Encabezado("Mis evaluaciones", "Instrumentos que te asignó tu psicólogo")
        when {
            error != null -> Column(Modifier.padding(16.dp)) { CajaError(error!!) { alcance.launch { cargar() } } }
            lista == null -> Cargando()
            lista!!.isEmpty() -> Text("Aún no tienes evaluaciones asignadas.", Modifier.padding(24.dp), color = Colores.TextoApoyo)
            else -> LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                items(lista!!) { ev -> TarjetaEvaluacion(ev) { alAbrir(ev.idEvaluacion) } }
            }
        }
    }
}

@Composable
private fun TarjetaEvaluacion(ev: Evaluacion, alAbrir: () -> Unit) {
    val completada = ev.estado == "COMPLETADA"
    Card(
        colors = CardDefaults.cardColors(containerColor = Color.White),
        modifier = Modifier.fillMaxWidth().then(if (completada) Modifier else Modifier.clickable(onClick = alAbrir)),
    ) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(ev.siglas, style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                when (ev.estado) {
                    "PENDIENTE" -> EtiquetaEstado("Pendiente", Colores.NaranjaClaro, Colores.Naranja)
                    "INICIADA" -> EtiquetaEstado("En curso", Colores.AzulClaro, Colores.Azul)
                    else -> EtiquetaEstado("Completada", Colores.VerdeClaro, Colores.Verde)
                }
            }
            Text(ev.nombre, color = Colores.TextoApoyo)
            if (!ev.mensaje.isNullOrBlank()) Text("“${ev.mensaje}”", style = MaterialTheme.typography.bodyMedium)
            if (completada) Text("Completada el ${fecha(ev.fechaCompletada)}", style = MaterialTheme.typography.bodyMedium, color = Colores.TextoApoyo)
            else {
                LinearProgressIndicator(progress = { if (ev.total > 0) ev.respondidas.toFloat() / ev.total else 0f },
                    modifier = Modifier.fillMaxWidth(), color = Colores.Morado, trackColor = Colores.MoradoClaro)
                Row {
                    Text("${ev.respondidas} de ${ev.total} preguntas", style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
                    Text("Vence ${fecha(ev.fechaLimite)}", style = MaterialTheme.typography.bodyMedium, color = Colores.Naranja)
                }
                BotonPrincipal(if (ev.estado == "INICIADA") "Continuar" else "Comenzar", Modifier.fillMaxWidth(), onClick = alAbrir)
            }
        }
    }
}

/** GUI-6.2 Responder instrumento: una pregunta a la vez; cada respuesta se guarda al momento (CU-11 3A). */
@Composable
fun PantallaResponder(idEvaluacion: Int, alTerminar: () -> Unit) {
    val alcance = rememberCoroutineScope()
    var detalle by remember { mutableStateOf<EvaluacionDetalle?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    val valores = remember { mutableStateMapOf<Int, Int>() }
    var indice by remember { mutableIntStateOf(0) }
    var confirmar by remember { mutableStateOf(false) }
    var enviando by remember { mutableStateOf(false) }
    var resultado by remember { mutableStateOf<RespuestaFinalizar?>(null) }

    LaunchedEffect(idEvaluacion) {
        try {
            val d = Api.evaluacion(idEvaluacion)
            d.preguntas.forEach { p -> p.valor?.let { valores[p.idPregunta] = it } }
            indice = d.preguntas.indexOfFirst { it.valor == null }.let { if (it < 0) d.preguntas.lastIndex else it }
            detalle = d
        } catch (e: ErrorDeApi) { error = e.message }
    }

    Column(Modifier.fillMaxSize()) {
        Encabezado(detalle?.siglas ?: "Evaluación", detalle?.nombre) {
            TextButton(onClick = alTerminar) { Text("Salir", color = Color.White) }
        }
        val d = detalle
        when {
            error != null -> Column(Modifier.padding(16.dp)) { CajaError(error!!) }
            d == null -> Cargando()
            else -> {
                val p = d.preguntas[indice]
                val respondidas = d.preguntas.count { valores.containsKey(it.idPregunta) }
                Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                    LinearProgressIndicator(progress = { respondidas.toFloat() / d.preguntas.size }, modifier = Modifier.fillMaxWidth(),
                        color = Colores.Morado, trackColor = Colores.MoradoClaro)
                    Text("Pregunta ${indice + 1} de ${d.preguntas.size} · tu avance se guarda solo", style = MaterialTheme.typography.bodyMedium, color = Colores.TextoApoyo)
                    if (d.siglas == "BAI") Text("En la última semana, ¿cuánto te ha molestado…?", color = Colores.TextoApoyo)
                    Text(p.texto, style = MaterialTheme.typography.titleLarge)
                    p.opciones.forEachIndexed { i, etiqueta ->
                        val valor = p.minimo + i
                        val elegido = valores[p.idPregunta] == valor
                        Card(
                            colors = CardDefaults.cardColors(containerColor = if (elegido) Colores.MoradoClaro else Color.White),
                            border = BorderStroke(if (elegido) 2.dp else 1.dp, if (elegido) Colores.Morado else Colores.Gris),
                            shape = RoundedCornerShape(12.dp),
                            modifier = Modifier.fillMaxWidth().clickable {
                                valores[p.idPregunta] = valor
                                alcance.launch {
                                    try { Api.registrarValor(d.idEvaluacion, p.idPregunta, valor); error = null }
                                    catch (e: ErrorDeApi) { error = e.message }
                                    delay(250)
                                    if (indice < d.preguntas.lastIndex && indice == d.preguntas.indexOf(p)) indice++
                                }
                            },
                        ) {
                            Row(Modifier.fillMaxWidth().heightIn(min = 52.dp).padding(horizontal = 12.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                                RadioButton(selected = elegido, onClick = null)
                                Spacer(Modifier.width(8.dp))
                                Text(etiqueta, style = MaterialTheme.typography.bodyLarge, fontWeight = if (elegido) FontWeight.SemiBold else FontWeight.Normal)
                            }
                        }
                    }
                }
                Row(Modifier.fillMaxWidth().navigationBarsPadding().padding(16.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    OutlinedButton(onClick = { indice-- }, enabled = indice > 0, modifier = Modifier.weight(1f).heightIn(min = 48.dp)) { Text("Anterior") }
                    if (indice < d.preguntas.lastIndex) {
                        BotonPrincipal("Siguiente", Modifier.weight(1f), habilitado = valores.containsKey(p.idPregunta)) { indice++ }
                    } else {
                        BotonPrincipal("Finalizar y enviar", Modifier.weight(1f), habilitado = respondidas == d.preguntas.size && !enviando) { confirmar = true }
                    }
                }
            }
        }
    }

    if (confirmar) {
        AlertDialog(
            onDismissRequest = { confirmar = false },
            title = { Text("¿Enviar tus respuestas?") },
            text = { Text("Ya no podrás cambiarlas. Tu psicólogo recibirá el resultado.") },
            confirmButton = {
                TextButton(enabled = !enviando, onClick = {
                    enviando = true
                    alcance.launch {
                        try { resultado = Api.finalizar(idEvaluacion) } catch (e: ErrorDeApi) { error = e.message }
                        enviando = false; confirmar = false
                    }
                }) { Text(if (enviando) "Enviando…" else "Enviar") }
            },
            dismissButton = { TextButton(onClick = { confirmar = false }) { Text("Revisar") } },
        )
    }
    resultado?.let { r ->
        AlertDialog(
            onDismissRequest = alTerminar,
            title = { Text("¡Gracias!") },
            text = { Text(r.mensaje) },
            confirmButton = { TextButton(onClick = alTerminar) { Text("Listo") } },
        )
    }
}
