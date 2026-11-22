# Deja la base de datos SentIA (SQL Server Express local, sin Docker) como al inicio de la demo:
# borra y vuelve a crear la BD con el script base y aplica los ajustes del prototipo.
# Con Docker no hace falta: usa  .\iniciar.ps1 -Reiniciar
$ErrorActionPreference = 'Stop'
$aqui = Split-Path -Parent $MyInvocation.MyCommand.Path
$scriptBase = Join-Path $aqui '..\docker\bd\base\SentIA_BD_SQLServer.sql'
$ajustes = Join-Path $aqui '01_ajustes_prototipo.sql'

sqlcmd -S '.\SQLEXPRESS' -E -b -f 65001 -i $scriptBase
if ($LASTEXITCODE -ne 0) { throw 'Fallo el script base de la base de datos.' }
sqlcmd -S '.\SQLEXPRESS' -E -b -f 65001 -i $ajustes
if ($LASTEXITCODE -ne 0) { throw 'Fallaron los ajustes del prototipo.' }
Write-Host 'Base de datos SentIA lista para la demo. Si la API estaba encendida, vuelve a ejecutar npm start.'
