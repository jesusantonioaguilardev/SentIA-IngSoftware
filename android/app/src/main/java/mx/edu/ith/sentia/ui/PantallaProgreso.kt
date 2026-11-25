package mx.edu.ith.sentia.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import mx.edu.ith.sentia.data.Api
import mx.edu.ith.sentia.data.ErrorDeApi
import mx.edu.ith.sentia.data.Progreso
import mx.edu.ith.sentia.data.PuntoAnimo
import mx.edu.ith.sentia.data.Retroalimentacion

/** GUI-7.1 Mi progreso (CU-12): solo la retroalimentación que el psicólogo autorizó. */
@Composable
fun PantallaProgreso() {
    val alcance = rememberCoroutineScope()
    var datos by remember { mutableStateOf<Progreso?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    suspend fun cargar() { try { datos = Api.progreso(); error = null } catch (e: ErrorDeApi) { error = e.message } }
    LaunchedEffect(Unit) { cargar() }

    Column(Modifier.fillMaxSize()) {
        Encabezado("Mi progreso", "Tu evolución y las recomendaciones de tu psicólogo")
        val d = datos
        when {
            error != null -> Column(Modifier.padding(16.dp)) { CajaError(error!!) { alcance.launch { cargar() } } }
            d == null -> Cargando()
            else -> Column(Modifier.verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                Card(colors = CardDefaults.cardColors(containerColor = Colores.MoradoClaro)) {
                    Column(Modifier.padding(16.dp)) {
                        Text("Recomendación del día", fontWeight = FontWeight.Bold, color = Colores.MoradoOscuro)
                        Text(d.recomendacionDelDia)
                    }
                }
                Card(colors = CardDefaults.cardColors(containerColor = Color.White)) {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("Mi estado de ánimo", style = MaterialTheme.typography.titleMedium)
                        if (d.animo.size < 2) Text("Registra tu ánimo en Inicio unos días para ver tu gráfica.", color = Colores.TextoApoyo)
                        else GraficaAnimo(d.animo)
                    }
                }
                Text("Mis resultados", style = MaterialTheme.typography.titleMedium)
                if (d.resultados.isEmpty()) Text("Cuando respondas una evaluación, aquí verás tu retroalimentación.", color = Colores.TextoApoyo)
                d.resultados.asReversed().forEach { TarjetaResultado(it) }
                GraficaPuntajes(d.resultados.filter { it.autorizado && it.puntaje != null })
            }
        }
    }
}

@Composable
private fun TarjetaResultado(r: Retroalimentacion) {
    Card(colors = CardDefaults.cardColors(containerColor = if (r.autorizado) Color.White else Colores.NaranjaClaro)) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(r.siglas, style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                Text(fecha(r.fecha), style = MaterialTheme.typography.labelSmall, color = Colores.TextoApoyo)
            }
            if (r.autorizado) {
                Text("Resultado: ${r.categoria}", fontWeight = FontWeight.SemiBold, color = Colores.MoradoOscuro)
                Text(r.mensaje)
                r.recomendacion?.let { Text("Recomendación: $it", color = Colores.TextoApoyo, style = MaterialTheme.typography.bodyMedium) }
            } else {
                Text("En revisión", fontWeight = FontWeight.SemiBold, color = Colores.Naranja)
                Text(r.mensaje, style = MaterialTheme.typography.bodyMedium)
            }
        }
    }
}

@Composable
private fun GraficaAnimo(puntos: List<PuntoAnimo>) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        // Eje: arriba "Muy bien", abajo "Muy mal" (mismos íconos que en Inicio)
        Column(Modifier.height(120.dp).padding(end = 10.dp), verticalArrangement = Arrangement.SpaceBetween) {
            Icon(ANIMOS[4].first, contentDescription = ANIMOS[4].second, tint = Colores.Verde, modifier = Modifier.size(24.dp))
            Icon(ANIMOS[0].first, contentDescription = ANIMOS[0].second, tint = Colores.Naranja, modifier = Modifier.size(24.dp))
        }
        Canvas(Modifier.weight(1f).height(120.dp)) {
            val paso = size.width / (puntos.size - 1).coerceAtLeast(1)
            val y = { v: Double -> size.height - ((v - 1) / 4.0 * (size.height - 16f)).toFloat() - 8f }
            for (n in 1..5) drawLine(Colores.Gris.copy(alpha = .5f), Offset(0f, y(n.toDouble())), Offset(size.width, y(n.toDouble())), 1f)
            val pts = puntos.mapIndexed { i, p -> Offset(i * paso, y(p.valor)) }
            pts.zipWithNext().forEach { (a, b) -> drawLine(Colores.Morado, a, b, strokeWidth = 6f, cap = StrokeCap.Round) }
            pts.forEach { drawCircle(Colores.Morado, 8f, it) }
        }
    }
    Text("Últimos ${puntos.size} días", style = MaterialTheme.typography.labelSmall, color = Colores.TextoApoyo,
        modifier = Modifier.fillMaxWidth(), textAlign = TextAlign.End)
}

@Composable
private fun GraficaPuntajes(resultados: List<Retroalimentacion>) {
    if (resultados.size < 2) return
    Card(colors = CardDefaults.cardColors(containerColor = Color.White)) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Evolución de mis evaluaciones", style = MaterialTheme.typography.titleMedium)
            val max = resultados.maxOf { it.puntaje ?: 0 }.coerceAtLeast(1)
            resultados.forEach { r ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("${r.siglas} ${fecha(r.fecha).take(5)}", Modifier.weight(.4f), style = MaterialTheme.typography.labelSmall)
                    Canvas(Modifier.weight(.6f).height(18.dp)) {
                        drawLine(Colores.Morado, Offset(0f, size.height / 2), Offset(size.width * (r.puntaje ?: 0) / max, size.height / 2), strokeWidth = size.height, cap = StrokeCap.Round)
                    }
                }
            }
        }
    }
}
