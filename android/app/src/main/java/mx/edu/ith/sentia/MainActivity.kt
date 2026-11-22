package mx.edu.ith.sentia

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import mx.edu.ith.sentia.data.Api
import mx.edu.ith.sentia.ui.AppSentIA
import mx.edu.ith.sentia.ui.Avisos

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Api.cargar(this)
        Avisos.crearCanal(this)
        setContent { AppSentIA() }
    }
}
