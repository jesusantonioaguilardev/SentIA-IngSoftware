package mx.edu.ith.sentia.ui

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Call
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import mx.edu.ith.sentia.data.LineaApoyo

/** Encabezado morado de la app (distribución fija del entregable 12). */
@Composable
fun Encabezado(titulo: String, subtitulo: String? = null, accion: (@Composable () -> Unit)? = null) {
    Row(
        Modifier.fillMaxWidth().background(Colores.Morado).statusBarsPadding().padding(horizontal = 20.dp, vertical = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(titulo, color = Color.White, style = MaterialTheme.typography.titleLarge)
            if (subtitulo != null) Text(subtitulo, color = Color.White.copy(alpha = .85f), style = MaterialTheme.typography.bodyMedium)
        }
        accion?.invoke()
    }
}

@Composable
fun Cargando() {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
}

@Composable
fun CajaError(mensaje: String, reintentar: (() -> Unit)? = null) {
    Card(colors = CardDefaults.cardColors(containerColor = Colores.RojoClaro), modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(mensaje, color = Colores.Rojo)
            if (reintentar != null) OutlinedButton(onClick = reintentar) { Text("Reintentar") }
        }
    }
}

/** Botón principal morado, de al menos 48 dp de alto (accesibilidad). */
@Composable
fun BotonPrincipal(texto: String, modifier: Modifier = Modifier, habilitado: Boolean = true, onClick: () -> Unit) {
    Button(
        onClick = onClick, enabled = habilitado, modifier = modifier.heightIn(min = 48.dp),
        shape = RoundedCornerShape(10.dp), colors = ButtonDefaults.buttonColors(containerColor = Colores.Morado),
    ) { Text(texto) }
}

/** El nivel de riesgo siempre lleva texto además del color. */
@Composable
fun EtiquetaNivel(nivel: String) {
    val (fondo, texto, nombre) = when (nivel) {
        "CRITICO" -> Triple(Colores.Rojo, Color.White, "Crítico")
        "ALTO" -> Triple(Colores.RojoClaro, Colores.Rojo, "Alto")
        "MEDIO" -> Triple(Colores.NaranjaClaro, Colores.Naranja, "Medio")
        else -> Triple(Colores.VerdeClaro, Colores.Verde, "Bajo")
    }
    Text(nombre, color = texto, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.labelSmall,
        modifier = Modifier.clip(RoundedCornerShape(50)).background(fondo).padding(horizontal = 10.dp, vertical = 3.dp))
}

@Composable
fun EtiquetaEstado(texto: String, fondo: Color, color: Color) {
    Text(texto, color = color, fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.labelSmall,
        modifier = Modifier.clip(RoundedCornerShape(6.dp)).background(fondo).padding(horizontal = 8.dp, vertical = 3.dp))
}

val LINEAS_LOCALES = listOf(
    LineaApoyo("Línea de la Vida (24 h, gratuita)", "8009112000"),
    LineaApoyo("Emergencias", "911"),
)

fun marcar(ctx: Context, telefono: String) {
    ctx.startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:$telefono")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
}

/** La app siempre muestra la Línea de la Vida en pantallas de crisis. */
@Composable
fun LineasDeApoyo(lineas: List<LineaApoyo> = LINEAS_LOCALES, compacto: Boolean = false) {
    val ctx = LocalContext.current
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        lineas.forEach { l ->
            OutlinedButton(onClick = { marcar(ctx, l.telefono) }, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
                shape = RoundedCornerShape(10.dp)) {
                Icon(Icons.Filled.Call, contentDescription = null, tint = Colores.Rojo, modifier = Modifier.size(20.dp))
                Spacer(Modifier.width(10.dp))
                Text(if (compacto) l.nombre else "${l.nombre}: ${formatoTelefono(l.telefono)}", color = Colores.Texto, modifier = Modifier.weight(1f))
            }
        }
    }
}

fun formatoTelefono(t: String) = if (t.length == 10) "${t.substring(0, 3)} ${t.substring(3, 6)} ${t.substring(6)}" else t

/** "2026-11-29" → "29/11/2026"; "2026-11-22 10:43" → "22/11/2026 10:43" */
fun fecha(f: String?): String {
    if (f.isNullOrBlank()) return "—"
    val partes = f.split(" ")
    val d = partes[0].split("-")
    val dia = if (d.size == 3) "${d[2]}/${d[1]}/${d[0]}" else partes[0]
    return if (partes.size > 1) "$dia ${partes[1]}" else dia
}
