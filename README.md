# SentIA · Prototipo semifuncional

Herramienta de apoyo para el seguimiento emocional y clínico de pacientes entre sesiones.
Proyecto de Ingeniería de Software · Instituto Tecnológico de Hermosillo · Equipo #1:
Jesús Antonio Aguilar Corrales, Diego Alonso Díaz Romero y Dante Alejandro Olivarria González.

El paciente usa una **app Android** para responder instrumentos clínicos, conversar con un asistente que detecta señales de riesgo y pedir ayuda con un **botón de emergencia**. El psicólogo usa un **software de monitoreo** donde recibe las alertas en tiempo real, revisa resultados y lleva el expediente clínico digital.

**Presentación:** [`presentacion/`](presentacion/) (PDF y PowerPoint).

| Pieza | Carpeta | Tecnología |
|---|---|---|
| API y reglas de negocio | `server/` | Node.js + Express + SQL Server (`mssql` / ODBC Driver 18) |
| Software de monitoreo del psicólogo | `monitoreo/` | HTML, CSS y JavaScript (lo sirve la API) |
| App del paciente | `android/` | Kotlin + Jetpack Compose (Android 8.0+) |
| Base de datos | `docker/bd/base/` y `sql/` | Script base de SQL Server, ajustes del prototipo y reinicio de la demo |
| Docker | `docker-compose.yml`, `docker/` | SQL Server 2022, inicialización de la BD y la API |

## Arranque con un solo comando (Docker) — recomendado

Requisitos: Docker Desktop. Para la app también hace falta Android Studio (SDK y emulador); sin él, todo lo demás funciona igual.

```powershell
.\iniciar.ps1
```

El script hace todo en orden y deja todo conectado:

1. Enciende Docker Desktop si está apagado.
2. Levanta tres contenedores (`docker-compose.yml`):
   * **`sentia-bd`**: SQL Server 2022, con los datos guardados en el volumen `sentia-datos`. Se puede abrir desde SSMS en `localhost,14333` con el usuario `sa`; la contraseña está en `.env`.
   * **`sentia-bd-inicio`**: la primera vez crea la BD con `docker/bd/base/SentIA_BD_SQLServer.sql` y siempre aplica `sql/01_ajustes_prototipo.sql`. Termina y se apaga.
   * **`sentia-api`**: la API y el software de monitoreo en <http://localhost:3000>. Arranca solo cuando la BD ya está lista.
3. Abre el software de monitoreo en el navegador.
4. Compila la app si no existe la APK, enciende el emulador, instala la app y la abre. La app ya apunta a `http://10.0.2.2:3000`, que es la API en Docker.

| Comando | Qué hace |
|---|---|
| `.\iniciar.ps1` | Arranca todo y conserva los datos |
| `.\iniciar.ps1 -Reiniciar` | Arranca y regresa la BD a los datos de ejemplo (antes de la demo) |
| `.\iniciar.ps1 -SinApp` | Solo Docker y navegador |
| `.\detener.ps1` | Apaga los contenedores (los datos se conservan) |
| `.\detener.ps1 -Emulador` | También apaga el emulador |
| `.\detener.ps1 -Borrar` | Apaga y borra la BD de Docker |
| `docker compose logs -f api` | Ver la actividad de la API |

La APK también se puede descargar desde <http://localhost:3000/descargar-app>, por ejemplo para instalarla en un celular conectado a la misma red Wi-Fi.

## Arranque manual sin Docker (SQL Server Express local)

**1. Base de datos.** Requiere SQL Server Express (`.\SQLEXPRESS`) con autenticación de Windows y el ODBC Driver 18. Este script la crea, o la deja como al inicio de la demo (borra lo que se haya probado):

```powershell
powershell -ExecutionPolicy Bypass -File ".\sql\reiniciar_demo.ps1"
```

**2. API + software de monitoreo**

```powershell
cd server
npm install      # solo la primera vez
npm start
```

Abre <http://localhost:3000> e inicia sesión como psicólogo.

**3. App Android**

* Desde Android Studio: *Open* → carpeta `android` → elegir el emulador `Medium_Phone_API_36.1` → *Run*.
* O desde la terminal: `cd android` y `.\gradlew installDebug` con el emulador encendido.
* La app se conecta a `http://10.0.2.2:3000` (la laptop vista desde el emulador). Para un celular físico: en el login, *Configuración del servidor* → `http://IP-de-la-laptop:3000` (la API imprime la IP al arrancar). Hay que permitir Node en el firewall de Windows. Por USB también sirve `adb reverse tcp:3000 tcp:3000` con `http://localhost:3000`.

## Usuarios de prueba

Contraseña de todos: **`SentIA2026!`**

| Usuario | Rol | Para qué sirve en la demo |
|---|---|---|
| christian.martinez@correo.com | Psicólogo (cliente) | Software de monitoreo |
| laura.perez@correo.com | Psicóloga de guardia | Recibe el SMS simulado cuando una alerta se escala |
| mafer.lopez@correo.com | Paciente | Consentimiento firmado, tiene el HAM-A pendiente, chat |
| lucia.hernandez@correo.com | Paciente | Consentimiento **pendiente**: muestra CU-10 2A |
| jorge.ramirez@correo.com | Paciente | Tiene el BAI a medias (INICIADA) |
| carlos.mendoza@correo.com | Paciente | Tiene el HAM-A pendiente |

Los psicólogos solo entran al software de monitoreo y los pacientes solo a la app.

## Qué está funcionando

| Caso de uso | Dónde | Estado |
|---|---|---|
| CU-13 Iniciar sesión (bloqueo tras 3 intentos) + CU-17 Bitácora | App y monitoreo | Funcional |
| CU-09 Consentimiento (aceptar y firmar con el dedo, o rechazar) | App | Funcional |
| CU-10 Chat + CU-07 Alertas (Secuencia 1) | App → monitoreo | Funcional, la "IA" es un analizador por reglas |
| CU-16 Botón de emergencia (con confirmación y modo sin conexión) | App → monitoreo | Funcional |
| CU-11 Responder instrumento + CU-15 Procesar resultados (Secuencia 2) | App | Funcional, guarda cada respuesta |
| CU-12 Ver retroalimentación (solo la autorizada) | App | Funcional |
| CU-06 Notificaciones | App | Simulado: la app consulta cada 10 s y muestra una notificación de Android |
| CU-03 Monitorear sesiones, alertas en vivo cada 3 s con sonido | Monitoreo | Funcional |
| Atender alerta con nota obligatoria (estados del diagrama 08) | Monitoreo | Funcional |
| Escalamiento a guardia tras 5 min sin leer | Monitoreo | Simulado: se registra el SMS en `notificacion` y en la bitácora |
| CU-01 Pacientes, CU-05 Expediente, CU-02 Asignar | Monitoreo | Funcional |
| CU-04 Resultados + CU-08 Reporte PDF | Monitoreo | Funcional (PDF con *Imprimir → Guardar como PDF*) |
| Reportes S-08 y S-09, bitácora | Monitoreo | Funcional (vistas de la base de datos) |
| CU-14 Registrar instrumento, recuperar contraseña, activar cuenta | — | Fuera del prototipo |

## Dónde se ve el diseño en el código

| Diagrama | Archivo |
|---|---|
| Secuencia 1 (alerta) | `server/routes/paciente.js` → `POST /chat` y `server/dominio/Sesion.js`, `Alerta.js` |
| Secuencia 2 (instrumento) | `server/routes/paciente.js` → `/evaluaciones/:id/finalizar` y `server/dominio/Instrumento.js` (`Instrumento`, `GuiaEvaluacion`, `Resultado`) |
| Diagrama de estados de la Alerta | `server/dominio/Alerta.js` (GENERADA → REGISTRADA → ENVIADA → ESCALADA → LEIDA → EN_ATENCION → ATENDIDA) |
| Diagrama de clases | Métodos con el mismo nombre en `server/dominio/` y `data class` en `android/.../data/Modelos.kt` |
| Interfaces GUI-x | Comentarios en cada pantalla de `android/.../ui/` y en `monitoreo/app.js` |

## Variables opcionales de la API

| Variable | Por defecto | Uso |
|---|---|---|
| `PORT` | 3000 | Puerto |
| `SENTIA_DB_HOST`, `SENTIA_DB_PORT`, `SENTIA_DB_USER`, `SENTIA_DB_PASSWORD` | (vacías) | Si se define el host, la API se conecta por TCP con usuario y contraseña (así funciona en Docker) |
| `SENTIA_DB` | `Server=lpc:localhost\SQLEXPRESS;Database=SentIA;Trusted_Connection=yes` (ODBC 18) | Cadena de conexión local con autenticación de Windows (sin Docker) |
| `SENTIA_ESCALAR_MIN` | 5 | Minutos antes de escalar una alerta no leída (en la demo se puede bajar a 1) |
| `SENTIA_INACTIVIDAD_MIN` | 30 | Minutos sin mensajes para marcar una sesión como inactiva |
