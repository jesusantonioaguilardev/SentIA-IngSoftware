# SentIA - inicia TODO el prototipo con un solo comando:
#   1. Docker: SQL Server + base de datos con datos de ejemplo + API y software de monitoreo
#   2. Abre el software de monitoreo en el navegador
#   3. Si esta instalado el SDK de Android: compila la app (si hace falta), enciende el emulador,
#      instala la app y la abre ya conectada a la API.
#
# Uso:   .\iniciar.ps1                 (conserva los datos)
#        .\iniciar.ps1 -Reiniciar      (borra la BD y vuelve a los datos de ejemplo de la demo)
#        .\iniciar.ps1 -SinApp         (solo Docker y navegador)
param(
    [switch]$Reiniciar,
    [switch]$SinApp,
    [string]$Emulador = 'Medium_Phone_API_36.1'
)
$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $raiz

function Paso($texto) { Write-Host "`n==> $texto" -ForegroundColor Magenta }
function Ok($texto) { Write-Host "    $texto" -ForegroundColor Green }

# ---------- 1. Docker ----------
Paso 'Revisando Docker'
$dockerListo = $false
try { docker info --format '{{.ServerVersion}}' *> $null; $dockerListo = ($LASTEXITCODE -eq 0) } catch { }
if (-not $dockerListo) {
    $dd = 'C:\Program Files\Docker\Docker\Docker Desktop.exe'
    if (-not (Test-Path $dd)) { throw 'Docker Desktop no esta instalado. Instalalo desde https://www.docker.com/products/docker-desktop/' }
    Write-Host '    Encendiendo Docker Desktop...'
    Start-Process $dd
    for ($i = 0; $i -lt 90 -and -not $dockerListo; $i++) {
        Start-Sleep -Seconds 2
        try { docker info --format '{{.ServerVersion}}' *> $null; $dockerListo = ($LASTEXITCODE -eq 0) } catch { }
    }
    if (-not $dockerListo) { throw 'Docker no respondio en 3 minutos.' }
}
# docker compose escribe su progreso en stderr; en PowerShell 5.1 eso no debe contar como error.
$ErrorActionPreference = 'Continue'
Ok 'Docker listo'

# Puerto 3000 ocupado por una API local (npm start fuera de Docker)
$ocupado = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Where-Object {
    (Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue).ProcessName -eq 'node' }
if ($ocupado) {
    Write-Host '    El puerto 3000 lo usa una API de Node fuera de Docker; la detengo.' -ForegroundColor Yellow
    $ocupado | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
}

# Script de la BD: viene incluido en docker\bd\base. Si junto al prototipo esta la carpeta
# "13 ..." de los entregables, se toma de ahi la version mas reciente.
$scriptBase = Join-Path $raiz 'docker\bd\base\SentIA_BD_SQLServer.sql'
$carpeta13 = Get-ChildItem -Path (Split-Path -Parent $raiz) -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -like '13 *' } | Select-Object -First 1
if ($carpeta13 -and (Test-Path (Join-Path $carpeta13.FullName 'SentIA_BD_SQLServer.sql'))) {
    Copy-Item (Join-Path $carpeta13.FullName 'SentIA_BD_SQLServer.sql') $scriptBase -Force
}
if (-not (Test-Path $scriptBase)) { throw 'Falta docker\bd\base\SentIA_BD_SQLServer.sql (script de la base de datos).' }

Paso 'Levantando SQL Server, base de datos y API (la primera vez descarga ~1.5 GB)'
if ($Reiniciar) { $env:REINICIAR_BD = '1'; Write-Host '    Se reiniciara la BD con los datos de ejemplo.' } else { $env:REINICIAR_BD = '0' }
docker compose up -d --build
if ($LASTEXITCODE -ne 0) { docker compose logs bd-inicio; throw 'docker compose fallo.' }
Remove-Item Env:REINICIAR_BD -ErrorAction SilentlyContinue

$apiLista = $false
for ($i = 0; $i -lt 60 -and -not $apiLista; $i++) {
    try { $r = Invoke-RestMethod -Uri 'http://localhost:3000/api/ping' -TimeoutSec 3 -ErrorAction Stop } catch { $r = $null }
    if ($r -and $r.ok) { $apiLista = $true } else { Start-Sleep -Seconds 2 }
}
if (-not $apiLista) { docker compose logs --tail 40 api; throw 'La API no respondio.' }
Ok 'API y base de datos conectadas: http://localhost:3000'

Paso 'Abriendo el software de monitoreo del psicologo'
Start-Process 'http://localhost:3000'

# ---------- 2. App Android ----------
if ($SinApp) { Paso 'Listo (sin app Android)'; exit 0 }
# adb escribe avisos en stderr mientras el emulador arranca; no deben detener el script.
$ErrorActionPreference = 'Continue'

$sdk = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
$adb = Join-Path $sdk 'platform-tools\adb.exe'
$emu = Join-Path $sdk 'emulator\emulator.exe'
if (-not (Test-Path $adb)) {
    Paso 'No encontre el SDK de Android: la app se instala aparte (ver README).'
    Write-Host '    La APK se puede descargar en http://localhost:3000/descargar-app'
    exit 0
}

$apk = Join-Path $raiz 'android\app\build\outputs\apk\debug\app-debug.apk'
if (-not (Test-Path $apk)) {
    Paso 'Compilando la app Android (solo la primera vez)'
    Push-Location (Join-Path $raiz 'android')
    .\gradlew.bat assembleDebug --console=plain -q
    $codigo = $LASTEXITCODE
    Pop-Location
    if ($codigo -ne 0) { throw 'No se pudo compilar la app Android.' }
}

Paso 'Encendiendo el emulador de Android'
$conectado = (& $adb devices) -match 'emulator-\d+\s+device'
if (-not $conectado) {
    Start-Process $emu -ArgumentList '-avd', $Emulador, '-no-snapshot-load', '-no-boot-anim' -WindowStyle Normal
}
$arrancado = $false
for ($i = 0; $i -lt 150 -and -not $arrancado; $i++) {
    $b = (& $adb shell getprop sys.boot_completed 2>$null) -join ''
    if ($b.Trim() -eq '1') { $arrancado = $true } else { Start-Sleep -Seconds 2 }
}
if (-not $arrancado) { throw 'El emulador no termino de arrancar en 5 minutos.' }
Ok 'Emulador listo'

Paso 'Instalando y abriendo la app SentIA'
& $adb install -r $apk | Out-Null
& $adb shell pm grant mx.edu.ith.sentia android.permission.POST_NOTIFICATIONS 2>$null
& $adb shell am start -n mx.edu.ith.sentia/.MainActivity | Out-Null
Ok 'App abierta. Se conecta sola a http://10.0.2.2:3000 (la API en Docker).'

Paso 'Todo listo'
Write-Host '    Software de monitoreo: http://localhost:3000  (christian.martinez@correo.com)'
Write-Host '    App del paciente:      emulador                (mafer.lopez@correo.com)'
Write-Host '    Contrasena de demo:    SentIA2026!'
Write-Host '    Para apagar:           .\detener.ps1'
