package mx.edu.ith.sentia.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

// Guía de estilo del entregable 12: morado = acción principal, azul = navegación,
// naranja = avisos, rojo = solo riesgo crítico / errores / emergencia, grises = fondos.
object Colores {
    val Morado = Color(0xFF6B4FBB)
    val MoradoOscuro = Color(0xFF553C9A)
    val MoradoClaro = Color(0xFFEFEAFB)
    val Azul = Color(0xFF2F6FDE)
    val AzulClaro = Color(0xFFE8F0FD)
    val Naranja = Color(0xFFD97706)
    val NaranjaClaro = Color(0xFFFFF4E0)
    val Rojo = Color(0xFFD32F2F)
    val RojoClaro = Color(0xFFFDECEC)
    val Verde = Color(0xFF2E7D32)
    val VerdeClaro = Color(0xFFE8F5E9)
    val Fondo = Color(0xFFF3F4F8)
    val Texto = Color(0xFF1F2330)
    val TextoApoyo = Color(0xFF4A5064)
    val Gris = Color(0xFFD5D8E0)
}

private val esquema = lightColorScheme(
    primary = Colores.Morado,
    onPrimary = Color.White,
    primaryContainer = Colores.MoradoClaro,
    onPrimaryContainer = Colores.MoradoOscuro,
    secondary = Colores.Azul,
    onSecondary = Color.White,
    secondaryContainer = Colores.AzulClaro,
    onSecondaryContainer = Colores.Azul,
    tertiary = Colores.Naranja,
    error = Colores.Rojo,
    errorContainer = Colores.RojoClaro,
    background = Colores.Fondo,
    onBackground = Colores.Texto,
    surface = Color.White,
    onSurface = Colores.Texto,
    surfaceVariant = Colores.Fondo,
    onSurfaceVariant = Colores.TextoApoyo,
    outline = Colores.Gris,
)

// Letra mínima de 12 pt (accesibilidad, entregable 12).
private val tipografia = Typography(
    headlineSmall = TextStyle(fontSize = 22.sp, fontWeight = FontWeight.Bold),
    titleLarge = TextStyle(fontSize = 20.sp, fontWeight = FontWeight.SemiBold),
    titleMedium = TextStyle(fontSize = 17.sp, fontWeight = FontWeight.SemiBold),
    bodyLarge = TextStyle(fontSize = 16.sp, lineHeight = 23.sp),
    bodyMedium = TextStyle(fontSize = 14.sp, lineHeight = 20.sp),
    labelLarge = TextStyle(fontSize = 15.sp, fontWeight = FontWeight.SemiBold),
    labelSmall = TextStyle(fontSize = 12.sp),
)

@Composable
fun TemaSentIA(contenido: @Composable () -> Unit) {
    MaterialTheme(colorScheme = esquema, typography = tipografia, content = contenido)
}
