#!/bin/bash
# Inicializa la BD SentIA dentro de Docker.
#  - Si la BD no existe (o REINICIAR=1): ejecuta el script del entregable 13 (crea tablas, vistas y datos de ejemplo).
#  - Siempre: aplica los ajustes del prototipo (idempotentes).
set -euo pipefail

SQLCMD=(/opt/mssql-tools18/bin/sqlcmd -S bd -U sa -P "$SA_PASSWORD" -C -b -f 65001)

existe=$("${SQLCMD[@]}" -h -1 -W -Q "SET NOCOUNT ON; SELECT CASE WHEN DB_ID('SentIA') IS NULL THEN 0 ELSE 1 END" | tr -d '[:space:]')

if [ "${REINICIAR:-0}" = "1" ] || [ "$existe" != "1" ]; then
  echo "Creando la base de datos SentIA con el script del entregable 13..."
  "${SQLCMD[@]}" -i /sql-base/SentIA_BD_SQLServer.sql > /tmp/base.log || { cat /tmp/base.log; exit 1; }
else
  echo "La base de datos SentIA ya existe; se conservan sus datos."
fi

echo "Aplicando ajustes del prototipo..."
"${SQLCMD[@]}" -i /sql-prototipo/01_ajustes_prototipo.sql
echo "Base de datos lista."
