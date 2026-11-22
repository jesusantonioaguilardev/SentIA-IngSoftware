package mx.edu.ith.sentia.ui

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import mx.edu.ith.sentia.MainActivity
import mx.edu.ith.sentia.R

/**
 * CU-06 Notificaciones (simulación de push): la app consulta sus avisos cada 15 s
 * y muestra una notificación local de Android por cada aviso nuevo.
 */
object Avisos {
    private const val CANAL = "sentia_avisos"

    fun crearCanal(ctx: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val canal = NotificationChannel(CANAL, "Avisos de SentIA", NotificationManager.IMPORTANCE_DEFAULT)
            canal.description = "Instrumentos asignados, recordatorios y retroalimentación lista"
            ctx.getSystemService(NotificationManager::class.java).createNotificationChannel(canal)
        }
    }

    fun mostrar(ctx: Context, id: Int, titulo: String, texto: String) {
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return
        val abrir = PendingIntent.getActivity(
            ctx, 0, Intent(ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val n = NotificationCompat.Builder(ctx, CANAL)
            .setSmallIcon(R.drawable.ic_sentia)
            .setContentTitle(titulo)
            .setContentText(texto)
            .setStyle(NotificationCompat.BigTextStyle().bigText(texto))
            .setContentIntent(abrir)
            .setAutoCancel(true)
            .build()
        try { NotificationManagerCompat.from(ctx).notify(id, n) } catch (_: SecurityException) { }
    }

    fun titulo(tipo: String) = when (tipo) {
        "INSTRUMENTO" -> "Tienes una evaluación nueva"
        "RECORDATORIO" -> "Recordatorio de SentIA"
        "RESULTADO" -> "Tu retroalimentación está lista"
        else -> "SentIA"
    }
}
