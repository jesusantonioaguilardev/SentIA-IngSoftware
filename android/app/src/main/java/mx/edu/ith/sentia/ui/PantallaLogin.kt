package mx.edu.ith.sentia.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import mx.edu.ith.sentia.data.Api
import mx.edu.ith.sentia.data.ErrorDeApi
import mx.edu.ith.sentia.data.SesionUsuario

/** GUI-0.3 Inicio de sesión del paciente (CU-13). */
@Composable
fun PantallaLogin(alEntrar: (SesionUsuario) -> Unit) {
    val ctx = LocalContext.current
    val alcance = rememberCoroutineScope()
    var correo by remember { mutableStateOf("mafer.lopez@correo.com") }
    var contrasena by remember { mutableStateOf("") }
    var ver by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var cargando by remember { mutableStateOf(false) }
    var configurar by remember { mutableStateOf(false) }
    var servidor by remember { mutableStateOf(Api.servidor) }
    var estadoServidor by remember { mutableStateOf<String?>(null) }

    val correoValido = Regex("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$").matches(correo.trim())

    Column(
        Modifier.fillMaxSize().background(Colores.MoradoClaro).statusBarsPadding().imePadding()
            .verticalScroll(rememberScrollState()).padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Box(Modifier.padding(top = 24.dp).size(76.dp).clip(RoundedCornerShape(20.dp)).background(Colores.Morado), contentAlignment = Alignment.Center) {
            Text("S", color = Color.White, fontSize = 42.sp, fontWeight = FontWeight.Bold)
        }
        Text("SentIA", style = MaterialTheme.typography.headlineSmall, color = Colores.Morado)
        Text("Tu acompañamiento entre sesiones", color = Colores.TextoApoyo)

        Card(colors = CardDefaults.cardColors(containerColor = Color.White), modifier = Modifier.fillMaxWidth()) {
            Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedTextField(
                    value = correo, onValueChange = { correo = it; error = null }, label = { Text("Correo *") }, singleLine = true,
                    isError = correo.isNotBlank() && !correoValido,
                    supportingText = { if (correo.isNotBlank() && !correoValido) Text("Usa el formato usuario@dominio") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email), modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = contrasena, onValueChange = { contrasena = it; error = null }, label = { Text("Contraseña *") }, singleLine = true,
                    visualTransformation = if (ver) VisualTransformation.None else PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                    trailingIcon = { TextButton(onClick = { ver = !ver }) { Text(if (ver) "Ocultar" else "Ver") } },
                    supportingText = { Text("Mínimo 8 caracteres") },
                    modifier = Modifier.fillMaxWidth(),
                )
                error?.let { Text(it, color = Colores.Rojo) }
                BotonPrincipal(if (cargando) "Entrando…" else "Iniciar sesión", Modifier.fillMaxWidth(),
                    habilitado = !cargando && correoValido && contrasena.length >= 8) {
                    cargando = true
                    alcance.launch {
                        try { alEntrar(Api.iniciarSesion(correo.trim().lowercase(), contrasena)) }
                        catch (e: ErrorDeApi) { error = e.message }
                        finally { cargando = false }
                    }
                }
                Text("Prototipo · contraseña de demo: SentIA2026!", style = MaterialTheme.typography.labelSmall, color = Colores.TextoApoyo,
                    modifier = Modifier.fillMaxWidth(), textAlign = TextAlign.Center)
            }
        }

        Card(colors = CardDefaults.cardColors(containerColor = Colores.RojoClaro), modifier = Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("¿Estás en crisis?", fontWeight = FontWeight.Bold, color = Colores.Rojo)
                Text("No esperes a iniciar sesión. Llama ahora:", color = Colores.Texto)
                LineasDeApoyo()
            }
        }

        TextButton(onClick = { configurar = !configurar }) { Text(if (configurar) "Ocultar configuración" else "Configuración del servidor") }
        if (configurar) {
            Card(colors = CardDefaults.cardColors(containerColor = Color.White), modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Emulador: http://10.0.2.2:3000 · Celular: http://IP-de-la-laptop:3000", style = MaterialTheme.typography.labelSmall)
                    OutlinedTextField(servidor, { servidor = it; estadoServidor = null }, label = { Text("Dirección del servidor") },
                        singleLine = true, modifier = Modifier.fillMaxWidth(), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri))
                    BotonPrincipal("Guardar y probar conexión", Modifier.fillMaxWidth()) {
                        Api.cambiarServidor(ctx, servidor)
                        estadoServidor = "Probando…"
                        alcance.launch { estadoServidor = if (Api.ping()) "Conectado a ${Api.servidor}" else "No se pudo conectar a ${Api.servidor}" }
                    }
                    estadoServidor?.let { Text(it, color = if (it.startsWith("Conectado")) Colores.Verde else Colores.Rojo) }
                }
            }
        }
    }
}
