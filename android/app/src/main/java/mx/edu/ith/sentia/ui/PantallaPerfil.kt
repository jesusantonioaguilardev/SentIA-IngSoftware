package mx.edu.ith.sentia.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import mx.edu.ith.sentia.BuildConfig
import mx.edu.ith.sentia.data.Api

/** GUI-8.2 Mi perfil (versión reducida del prototipo). */
@Composable
fun PantallaPerfil(alSalir: () -> Unit) {
    val s = Api.sesion
    Column(Modifier.fillMaxSize()) {
        Encabezado("Mi perfil")
        Column(Modifier.verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Card(colors = CardDefaults.cardColors(containerColor = Color.White)) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text("${s?.nombre ?: ""} ${s?.apellidos ?: ""}", style = MaterialTheme.typography.titleMedium)
                    Text("Consentimiento informado: ${if (s?.consentimiento == "ACEPTADO") "firmado" else "pendiente"}", color = Colores.TextoApoyo)
                    Text("Servidor: ${Api.servidor}", style = MaterialTheme.typography.labelSmall, color = Colores.TextoApoyo)
                    Text("Versión ${BuildConfig.VERSION_NAME}", style = MaterialTheme.typography.labelSmall, color = Colores.TextoApoyo)
                }
            }
            Card(colors = CardDefaults.cardColors(containerColor = Colores.AzulClaro)) {
                Text("Para cambiar tus datos de contacto o revocar tu consentimiento, pídeselo a tu psicólogo. En esta versión del prototipo esa opción todavía no está en la app.",
                    Modifier.padding(16.dp), style = MaterialTheme.typography.bodyMedium)
            }
            Text("Líneas de apoyo", fontWeight = FontWeight.Bold)
            LineasDeApoyo()
            OutlinedButton(onClick = alSalir, modifier = Modifier.fillMaxWidth().height(48.dp)) { Text("Cerrar sesión") }
        }
    }
}
