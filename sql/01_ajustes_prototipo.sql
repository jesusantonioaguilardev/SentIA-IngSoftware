/* =========================================================================
   SentIA - Ajustes para el prototipo (se ejecuta DESPUÉS de SentIA_BD_SQLServer.sql)
   Se puede ejecutar varias veces sin romper nada.
   ========================================================================= */
USE SentIA;
GO

-- 1) Estado REGISTRADA del diagrama de estados de la Alerta (entregable 08).
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_alerta_estado')
    ALTER TABLE alerta DROP CONSTRAINT CK_alerta_estado;
ALTER TABLE alerta ADD CONSTRAINT CK_alerta_estado
    CHECK (estado IN ('GENERADA', 'REGISTRADA', 'ENVIADA', 'ESCALADA', 'LEIDA', 'EN_ATENCION', 'ATENDIDA'));
GO

-- 2) Contraseñas reales (bcrypt) para la demo. Contraseña de todos los usuarios: SentIA2026!
UPDATE usuario
SET contrasena_hash = '$2b$10$XGZlc4Hl7G0OsPloB9ER2OqL1zBJ3lLjnz6uAjsYemFcTbm5ykuvy',
    intentos_fallidos = 0, bloqueado_hasta = NULL
WHERE contrasena_hash LIKE '$2b$12$ejemplo%';
GO

-- 3) Rangos de interpretación del TQ (conteo de síntomas presentes, 0 a 6).
IF NOT EXISTS (SELECT 1 FROM guia_evaluacion g JOIN instrumento i ON i.id_instrumento = g.id_instrumento WHERE i.siglas = 'TQ')
INSERT INTO guia_evaluacion (id_instrumento, puntaje_min, puntaje_max, categoria, descripcion, recomendacion, indica_riesgo)
SELECT id_instrumento, 0, 2, 'Baja', N'Pocos síntomas postraumáticos.', N'Seguimiento habitual.', 0 FROM instrumento WHERE siglas = 'TQ' UNION ALL
SELECT id_instrumento, 3, 4, 'Moderada', N'Síntomas postraumáticos moderados.', N'Explorar el acontecimiento en sesión.', 0 FROM instrumento WHERE siglas = 'TQ' UNION ALL
SELECT id_instrumento, 5, 6, 'Alta', N'Síntomas postraumáticos importantes.', N'Valorar intervención focalizada en trauma.', 1 FROM instrumento WHERE siglas = 'TQ';
GO

-- 4) Las evaluaciones de ejemplo vencieron en noviembre; se recorre su fecha límite para la demo.
UPDATE evaluacion
SET fecha_limite = DATEADD(DAY, 7, CAST(GETDATE() AS DATE))
WHERE estado <> 'COMPLETADA' AND fecha_limite <= CAST(GETDATE() AS DATE)
  AND DATEADD(DAY, 7, CAST(GETDATE() AS DATE)) > fecha_asignacion;
GO

PRINT 'Ajustes del prototipo aplicados.';
GO
