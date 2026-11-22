# SentIA - apaga los contenedores (los datos se conservan en el volumen sentia-datos).
#   .\detener.ps1            apaga Docker
#   .\detener.ps1 -Emulador  tambien apaga el emulador de Android
#   .\detener.ps1 -Borrar    apaga y BORRA la base de datos de Docker
param([switch]$Emulador, [switch]$Borrar)
Set-Location (Split-Path -Parent $MyInvocation.MyCommand.Path)
if ($Borrar) { docker compose down -v } else { docker compose down }
if ($Emulador) {
    $adb = Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe'
    if (Test-Path $adb) { & $adb emu kill 2>$null }
}
Write-Host 'SentIA detenido.'
