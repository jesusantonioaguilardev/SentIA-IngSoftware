/* =========================================================================
   SentIA - Base de datos (SQL Server 2025 Express)
   Ingeniería de Software · Equipo #1 · Instituto Tecnológico de Hermosillo
   Modelo normalizado a 3a. Forma Normal
   ========================================================================= */
USE master;
GO
IF DB_ID('SentIA') IS NOT NULL BEGIN ALTER DATABASE SentIA SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE SentIA; END
GO
CREATE DATABASE SentIA COLLATE Modern_Spanish_CI_AS;
GO
USE SentIA;
GO

-- Usuario: Cuenta de acceso de psicólogos y pacientes (credenciales y rol).
CREATE TABLE usuario (
    id_usuario                     INT IDENTITY(1,1) NOT NULL,
    correo                         VARCHAR(100) NOT NULL,
    contrasena_hash                VARCHAR(255) NOT NULL,
    rol                            VARCHAR(10) NOT NULL,
    activo                         BIT NOT NULL DEFAULT 1,
    intentos_fallidos              TINYINT NOT NULL DEFAULT 0,
    bloqueado_hasta                DATETIME2 NULL,
    fecha_creacion                 DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT PK_usuario PRIMARY KEY (id_usuario),
    CONSTRAINT UQ_usuario_correo UNIQUE (correo),
    CONSTRAINT CK_usuario_correo CHECK (correo LIKE '%_@_%._%'),
    CONSTRAINT CK_usuario_rol CHECK (rol IN ('PSICOLOGO', 'PACIENTE'))
);
GO

-- TokenAcceso: Códigos de invitación (activar cuenta) y de recuperación de contraseña.
CREATE TABLE token_acceso (
    id_token                       INT IDENTITY(1,1) NOT NULL,
    id_usuario                     INT NOT NULL,
    tipo                           VARCHAR(12) NOT NULL,
    codigo                         VARCHAR(8) NOT NULL,
    fecha_expira                   DATETIME2 NOT NULL,
    usado                          BIT NOT NULL DEFAULT 0,
    CONSTRAINT PK_token_acceso PRIMARY KEY (id_token),
    CONSTRAINT FK_token_acceso_id_usuario FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario),
    CONSTRAINT CK_token_acceso_tipo CHECK (tipo IN ('INVITACION', 'RECUPERACION'))
);
GO

-- Psicologo: Profesional que atiende pacientes desde el software de monitoreo.
CREATE TABLE psicologo (
    id_psicologo                   INT IDENTITY(1,1) NOT NULL,
    id_usuario                     INT NOT NULL,
    nombre                         VARCHAR(60) NOT NULL,
    apellidos                      VARCHAR(80) NOT NULL,
    cedula_profesional             VARCHAR(10) NOT NULL,
    especialidad                   VARCHAR(60) NULL,
    telefono                       CHAR(10) NOT NULL,
    id_psicologo_guardia           INT NULL,
    sonido_alertas                 BIT NOT NULL DEFAULT 1,
    escalar_sms                    BIT NOT NULL DEFAULT 1,
    CONSTRAINT PK_psicologo PRIMARY KEY (id_psicologo),
    CONSTRAINT FK_psicologo_id_usuario FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario),
    CONSTRAINT UQ_psicologo_id_usuario UNIQUE (id_usuario),
    CONSTRAINT UQ_psicologo_cedula_profesional UNIQUE (cedula_profesional),
    CONSTRAINT CK_psicologo_cedula_profesional CHECK (LEN(cedula_profesional) BETWEEN 7 AND 8 AND cedula_profesional NOT LIKE '%[^0-9]%'),
    CONSTRAINT CK_psicologo_telefono CHECK (LEN(telefono) = 10 AND telefono NOT LIKE '%[^0-9]%'),
    CONSTRAINT FK_psicologo_id_psicologo_guardia FOREIGN KEY (id_psicologo_guardia) REFERENCES psicologo(id_psicologo)
);
GO

-- Paciente: Persona en tratamiento que usa la app móvil.
CREATE TABLE paciente (
    id_paciente                    INT IDENTITY(1,1) NOT NULL,
    id_usuario                     INT NOT NULL,
    id_psicologo                   INT NOT NULL,
    nombre                         VARCHAR(60) NOT NULL,
    apellidos                      VARCHAR(80) NOT NULL,
    fecha_nacimiento               DATE NOT NULL,
    genero                         VARCHAR(20) NOT NULL,
    telefono                       CHAR(10) NOT NULL,
    contacto_emergencia_nombre     VARCHAR(80) NULL,
    contacto_emergencia_telefono   CHAR(10) NULL,
    recibir_recordatorios          BIT NOT NULL DEFAULT 1,
    fecha_registro                 DATE NOT NULL DEFAULT CAST(GETDATE() AS DATE),
    activo                         BIT NOT NULL DEFAULT 1,
    CONSTRAINT PK_paciente PRIMARY KEY (id_paciente),
    CONSTRAINT FK_paciente_id_usuario FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario),
    CONSTRAINT UQ_paciente_id_usuario UNIQUE (id_usuario),
    CONSTRAINT FK_paciente_id_psicologo FOREIGN KEY (id_psicologo) REFERENCES psicologo(id_psicologo),
    CONSTRAINT CK_paciente_nombre CHECK (nombre NOT LIKE '%[0-9]%'),
    CONSTRAINT CK_paciente_edad CHECK (DATEDIFF(YEAR, fecha_nacimiento, GETDATE()) BETWEEN 1 AND 120),
    CONSTRAINT CK_paciente_genero CHECK (genero IN ('FEMENINO', 'MASCULINO', 'NO_BINARIO', 'NO_ESPECIFICA')),
    CONSTRAINT CK_paciente_telefono CHECK (LEN(telefono) = 10 AND telefono NOT LIKE '%[^0-9]%'),
    CONSTRAINT CK_paciente_contacto_emergencia_telefono CHECK (LEN(contacto_emergencia_telefono) = 10 AND contacto_emergencia_telefono NOT LIKE '%[^0-9]%')
);
GO

-- VersionTerminos: Versiones publicadas de los términos y aviso de privacidad.
CREATE TABLE version_terminos (
    id_version                     INT IDENTITY(1,1) NOT NULL,
    version                        VARCHAR(10) NOT NULL,
    texto_terminos                 NVARCHAR(MAX) NOT NULL,
    fecha_publicacion              DATE NOT NULL,
    CONSTRAINT PK_version_terminos PRIMARY KEY (id_version),
    CONSTRAINT UQ_version_terminos_version UNIQUE (version)
);
GO

-- ConsentimientoInformado: Aceptación o rechazo de los términos por un paciente.
CREATE TABLE consentimiento (
    id_consentimiento              INT IDENTITY(1,1) NOT NULL,
    id_paciente                    INT NOT NULL,
    id_version                     INT NOT NULL,
    estado                         VARCHAR(10) NOT NULL,
    fecha_firma                    DATETIME2 NULL,
    firma_digital                  VARBINARY(MAX) NULL,
    fecha_revocacion               DATETIME2 NULL,
    CONSTRAINT PK_consentimiento PRIMARY KEY (id_consentimiento),
    CONSTRAINT FK_consentimiento_id_paciente FOREIGN KEY (id_paciente) REFERENCES paciente(id_paciente),
    CONSTRAINT FK_consentimiento_id_version FOREIGN KEY (id_version) REFERENCES version_terminos(id_version),
    CONSTRAINT CK_consentimiento_estado CHECK (estado IN ('PENDIENTE', 'ACEPTADO', 'RECHAZADO'))
);
GO

-- ExpedienteClinico: Historial clínico digital de un paciente.
CREATE TABLE expediente_clinico (
    id_expediente                  INT IDENTITY(1,1) NOT NULL,
    id_paciente                    INT NOT NULL,
    fecha_apertura                 DATE NOT NULL,
    motivo_consulta                NVARCHAR(500) NOT NULL,
    diagnostico                    NVARCHAR(500) NULL,
    estado                         VARCHAR(7) NOT NULL,
    fecha_cierre                   DATE NULL,
    CONSTRAINT PK_expediente_clinico PRIMARY KEY (id_expediente),
    CONSTRAINT FK_expediente_clinico_id_paciente FOREIGN KEY (id_paciente) REFERENCES paciente(id_paciente),
    CONSTRAINT UQ_expediente_clinico_id_paciente UNIQUE (id_paciente),
    CONSTRAINT CK_expediente_clinico_estado CHECK (estado IN ('ABIERTO', 'CERRADO'))
);
GO

-- NotaEvolucion: Notas de evolución registradas en el expediente.
CREATE TABLE nota_evolucion (
    id_nota                        INT IDENTITY(1,1) NOT NULL,
    id_expediente                  INT NOT NULL,
    id_psicologo                   INT NOT NULL,
    fecha                          DATETIME2 NOT NULL,
    tipo_nota                      VARCHAR(30) NOT NULL,
    texto                          NVARCHAR(2000) NOT NULL,
    CONSTRAINT PK_nota_evolucion PRIMARY KEY (id_nota),
    CONSTRAINT FK_nota_evolucion_id_expediente FOREIGN KEY (id_expediente) REFERENCES expediente_clinico(id_expediente),
    CONSTRAINT FK_nota_evolucion_id_psicologo FOREIGN KEY (id_psicologo) REFERENCES psicologo(id_psicologo),
    CONSTRAINT CK_nota_evolucion_tipo_nota CHECK (tipo_nota IN ('SESION', 'LLAMADA', 'SEGUIMIENTO')),
    CONSTRAINT CK_nota_evolucion_texto CHECK (LEN(LTRIM(texto)) > 0)
);
GO

-- Instrumento: Instrumento clínico estandarizado (BAI, TQ, TOP-8, HAM-A…).
CREATE TABLE instrumento (
    id_instrumento                 INT IDENTITY(1,1) NOT NULL,
    nombre                         VARCHAR(80) NOT NULL,
    siglas                         VARCHAR(10) NOT NULL,
    tipo                           VARCHAR(40) NOT NULL,
    descripcion                    NVARCHAR(300) NULL,
    metodo_calificacion            VARCHAR(100) NOT NULL,
    version_autorizada             VARCHAR(20) NOT NULL,
    activo                         BIT NOT NULL DEFAULT 1,
    CONSTRAINT PK_instrumento PRIMARY KEY (id_instrumento),
    CONSTRAINT UQ_instrumento_siglas UNIQUE (siglas)
);
GO

-- Pregunta: Reactivo de un instrumento.
CREATE TABLE pregunta (
    id_pregunta                    INT IDENTITY(1,1) NOT NULL,
    id_instrumento                 INT NOT NULL,
    numero                         SMALLINT NOT NULL,
    texto                          NVARCHAR(300) NOT NULL,
    tipo_respuesta                 VARCHAR(20) NOT NULL,
    valor_minimo                   SMALLINT NOT NULL,
    valor_maximo                   SMALLINT NOT NULL,
    CONSTRAINT PK_pregunta PRIMARY KEY (id_pregunta),
    CONSTRAINT FK_pregunta_id_instrumento FOREIGN KEY (id_instrumento) REFERENCES instrumento(id_instrumento),
    CONSTRAINT CK_pregunta_tipo_respuesta CHECK (tipo_respuesta IN ('LIKERT', 'OPCION', 'SI_NO')),
    CONSTRAINT UQ_pregunta_num UNIQUE (id_instrumento, numero)
);
GO

-- GuiaEvaluacion: Rango de puntajes de un instrumento y su interpretación.
CREATE TABLE guia_evaluacion (
    id_guia                        INT IDENTITY(1,1) NOT NULL,
    id_instrumento                 INT NOT NULL,
    puntaje_min                    SMALLINT NOT NULL,
    puntaje_max                    SMALLINT NOT NULL,
    categoria                      VARCHAR(30) NOT NULL,
    descripcion                    NVARCHAR(500) NOT NULL,
    recomendacion                  NVARCHAR(500) NOT NULL,
    indica_riesgo                  BIT NOT NULL DEFAULT 0,
    CONSTRAINT PK_guia_evaluacion PRIMARY KEY (id_guia),
    CONSTRAINT FK_guia_evaluacion_id_instrumento FOREIGN KEY (id_instrumento) REFERENCES instrumento(id_instrumento),
    CONSTRAINT CK_guia_rango CHECK (puntaje_min <= puntaje_max)
);
GO

-- Evaluacion: Asignación de un instrumento a un paciente.
CREATE TABLE evaluacion (
    id_evaluacion                  INT IDENTITY(1,1) NOT NULL,
    id_paciente                    INT NOT NULL,
    id_instrumento                 INT NOT NULL,
    id_psicologo                   INT NOT NULL,
    fecha_asignacion               DATE NOT NULL DEFAULT CAST(GETDATE() AS DATE),
    fecha_limite                   DATE NOT NULL,
    repetir_cada_dias              SMALLINT NULL,
    recordatorio_horas             SMALLINT NULL,
    mensaje_paciente               NVARCHAR(300) NULL,
    estado                         VARCHAR(10) NOT NULL,
    fecha_completada               DATETIME2 NULL,
    CONSTRAINT PK_evaluacion PRIMARY KEY (id_evaluacion),
    CONSTRAINT FK_evaluacion_id_paciente FOREIGN KEY (id_paciente) REFERENCES paciente(id_paciente),
    CONSTRAINT FK_evaluacion_id_instrumento FOREIGN KEY (id_instrumento) REFERENCES instrumento(id_instrumento),
    CONSTRAINT FK_evaluacion_id_psicologo FOREIGN KEY (id_psicologo) REFERENCES psicologo(id_psicologo),
    CONSTRAINT CK_evaluacion_estado CHECK (estado IN ('PENDIENTE', 'INICIADA', 'COMPLETADA')),
    CONSTRAINT CK_eval_fechas CHECK (fecha_limite > fecha_asignacion)
);
GO

-- Respuesta: Valor que dio el paciente a una pregunta en una evaluación.
CREATE TABLE respuesta (
    id_respuesta                   INT IDENTITY(1,1) NOT NULL,
    id_evaluacion                  INT NOT NULL,
    id_pregunta                    INT NOT NULL,
    valor                          SMALLINT NOT NULL,
    fecha_respuesta                DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT PK_respuesta PRIMARY KEY (id_respuesta),
    CONSTRAINT FK_respuesta_id_evaluacion FOREIGN KEY (id_evaluacion) REFERENCES evaluacion(id_evaluacion),
    CONSTRAINT FK_respuesta_id_pregunta FOREIGN KEY (id_pregunta) REFERENCES pregunta(id_pregunta),
    CONSTRAINT UQ_respuesta UNIQUE (id_evaluacion, id_pregunta)
);
GO

-- Resultado: Puntaje e interpretación de una evaluación completada.
CREATE TABLE resultado (
    id_resultado                   INT IDENTITY(1,1) NOT NULL,
    id_evaluacion                  INT NOT NULL,
    id_guia                        INT NOT NULL,
    puntaje                        SMALLINT NOT NULL,
    interpretacion                 NVARCHAR(500) NOT NULL,
    retroalimentacion_autorizada   BIT NOT NULL DEFAULT 0,
    fecha_resultado                DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT PK_resultado PRIMARY KEY (id_resultado),
    CONSTRAINT FK_resultado_id_evaluacion FOREIGN KEY (id_evaluacion) REFERENCES evaluacion(id_evaluacion),
    CONSTRAINT UQ_resultado_id_evaluacion UNIQUE (id_evaluacion),
    CONSTRAINT FK_resultado_id_guia FOREIGN KEY (id_guia) REFERENCES guia_evaluacion(id_guia)
);
GO

-- RegistroAnimo: Estado de ánimo diario que marca el paciente en la app.
CREATE TABLE registro_animo (
    id_registro                    INT IDENTITY(1,1) NOT NULL,
    id_paciente                    INT NOT NULL,
    fecha_hora                     DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    valor                          TINYINT NOT NULL,
    CONSTRAINT PK_registro_animo PRIMARY KEY (id_registro),
    CONSTRAINT FK_registro_animo_id_paciente FOREIGN KEY (id_paciente) REFERENCES paciente(id_paciente),
    CONSTRAINT CK_registro_animo_valor CHECK (valor BETWEEN 1 AND 5)
);
GO

-- Sesion: Conversación del paciente con la IA.
CREATE TABLE sesion (
    id_sesion                      INT IDENTITY(1,1) NOT NULL,
    id_paciente                    INT NOT NULL,
    fecha_inicio                   DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    fecha_fin                      DATETIME2 NULL,
    estado                         VARCHAR(10) NOT NULL,
    emocion_detectada              VARCHAR(30) NULL,
    nivel_riesgo                   VARCHAR(7) NOT NULL,
    CONSTRAINT PK_sesion PRIMARY KEY (id_sesion),
    CONSTRAINT FK_sesion_id_paciente FOREIGN KEY (id_paciente) REFERENCES paciente(id_paciente),
    CONSTRAINT CK_sesion_estado CHECK (estado IN ('ACTIVA', 'INACTIVA', 'FINALIZADA')),
    CONSTRAINT CK_sesion_nivel_riesgo CHECK (nivel_riesgo IN ('BAJO', 'MEDIO', 'ALTO', 'CRITICO'))
);
GO

-- Mensaje: Mensaje del chat de una sesión.
CREATE TABLE mensaje (
    id_mensaje                     BIGINT IDENTITY(1,1) NOT NULL,
    id_sesion                      INT NOT NULL,
    emisor                         VARCHAR(8) NOT NULL,
    texto                          NVARCHAR(1000) NOT NULL,
    fecha_hora                     DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT PK_mensaje PRIMARY KEY (id_mensaje),
    CONSTRAINT FK_mensaje_id_sesion FOREIGN KEY (id_sesion) REFERENCES sesion(id_sesion),
    CONSTRAINT CK_mensaje_emisor CHECK (emisor IN ('PACIENTE', 'SENTIA')),
    CONSTRAINT CK_mensaje_texto CHECK (LEN(LTRIM(texto)) > 0)
);
GO

-- Notificacion: Aviso enviado a un usuario (psicólogo o paciente).
CREATE TABLE notificacion (
    id_notificacion                INT IDENTITY(1,1) NOT NULL,
    id_usuario                     INT NOT NULL,
    tipo                           VARCHAR(30) NOT NULL,
    canal                          VARCHAR(8) NOT NULL,
    mensaje                        NVARCHAR(300) NOT NULL,
    fecha_envio                    DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    leida                          BIT NOT NULL DEFAULT 0,
    CONSTRAINT PK_notificacion PRIMARY KEY (id_notificacion),
    CONSTRAINT FK_notificacion_id_usuario FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario),
    CONSTRAINT CK_notificacion_tipo CHECK (tipo IN ('INSTRUMENTO', 'RECORDATORIO', 'RESULTADO', 'ALERTA')),
    CONSTRAINT CK_notificacion_canal CHECK (canal IN ('PUSH', 'CORREO', 'SMS', 'PANTALLA'))
);
GO

-- Alerta: Notificación urgente por situación de riesgo (especialización de Notificacion).
CREATE TABLE alerta (
    id_notificacion                INT NOT NULL,
    id_paciente                    INT NOT NULL,
    id_sesion                      INT NULL,
    id_resultado                   INT NULL,
    origen                         VARCHAR(16) NOT NULL,
    nivel_riesgo                   VARCHAR(7) NOT NULL,
    prioridad                      TINYINT NOT NULL,
    estado                         VARCHAR(11) NOT NULL,
    CONSTRAINT PK_alerta PRIMARY KEY (id_notificacion),
    CONSTRAINT FK_alerta_id_notificacion FOREIGN KEY (id_notificacion) REFERENCES notificacion(id_notificacion),
    CONSTRAINT FK_alerta_id_paciente FOREIGN KEY (id_paciente) REFERENCES paciente(id_paciente),
    CONSTRAINT FK_alerta_id_sesion FOREIGN KEY (id_sesion) REFERENCES sesion(id_sesion),
    CONSTRAINT FK_alerta_id_resultado FOREIGN KEY (id_resultado) REFERENCES resultado(id_resultado),
    CONSTRAINT CK_alerta_origen CHECK (origen IN ('CONVERSACION', 'RESULTADO', 'BOTON_EMERGENCIA')),
    CONSTRAINT CK_alerta_nivel_riesgo CHECK (nivel_riesgo IN ('BAJO', 'MEDIO', 'ALTO', 'CRITICO')),
    CONSTRAINT CK_alerta_prioridad CHECK (prioridad BETWEEN 1 AND 4),
    CONSTRAINT CK_alerta_estado CHECK (estado IN ('GENERADA', 'ENVIADA', 'ESCALADA', 'LEIDA', 'EN_ATENCION', 'ATENDIDA'))
);
GO

-- AtencionAlerta: Registro de cómo se atendió una alerta.
CREATE TABLE atencion_alerta (
    id_atencion                    INT IDENTITY(1,1) NOT NULL,
    id_notificacion                INT NOT NULL,
    id_psicologo                   INT NOT NULL,
    accion                         VARCHAR(40) NOT NULL,
    fecha_atencion                 DATETIME2 NOT NULL,
    nota                           NVARCHAR(500) NOT NULL,
    nivel_riesgo_posterior         VARCHAR(7) NOT NULL,
    requiere_seguimiento           BIT NOT NULL DEFAULT 0,
    CONSTRAINT PK_atencion_alerta PRIMARY KEY (id_atencion),
    CONSTRAINT FK_atencion_alerta_id_notificacion FOREIGN KEY (id_notificacion) REFERENCES alerta(id_notificacion),
    CONSTRAINT UQ_atencion_alerta_id_notificacion UNIQUE (id_notificacion),
    CONSTRAINT FK_atencion_alerta_id_psicologo FOREIGN KEY (id_psicologo) REFERENCES psicologo(id_psicologo),
    CONSTRAINT CK_atencion_alerta_nota CHECK (LEN(LTRIM(nota)) > 0),
    CONSTRAINT CK_atencion_alerta_nivel_riesgo_posterior CHECK (nivel_riesgo_posterior IN ('BAJO', 'MEDIO', 'ALTO', 'CRITICO'))
);
GO

-- Bitacora: Registro de accesos, operaciones y errores (auditoría).
CREATE TABLE bitacora (
    id_bitacora                    BIGINT IDENTITY(1,1) NOT NULL,
    id_usuario                     INT NULL,
    tipo_evento                    VARCHAR(9) NOT NULL,
    detalle                        NVARCHAR(300) NOT NULL,
    fecha_hora                     DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    ip_origen                      VARCHAR(45) NULL,
    CONSTRAINT PK_bitacora PRIMARY KEY (id_bitacora),
    CONSTRAINT FK_bitacora_id_usuario FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario),
    CONSTRAINT CK_bitacora_tipo_evento CHECK (tipo_evento IN ('ACCESO', 'OPERACION', 'ERROR'))
);
GO

-- ===================== VISTAS QUE ALIMENTAN LAS SALIDAS =====================
-- S-03 Panel de monitoreo de sesiones
CREATE VIEW vw_monitoreo_sesiones AS
SELECT s.id_sesion, p.id_psicologo, p.nombre + ' ' + p.apellidos AS paciente, s.estado, s.emocion_detectada,
       s.nivel_riesgo, s.fecha_inicio,
       (SELECT MAX(m.fecha_hora) FROM mensaje m WHERE m.id_sesion = s.id_sesion) AS ultima_actividad
FROM sesion s JOIN paciente p ON p.id_paciente = s.id_paciente;
GO
-- S-04 / S-05 Resultados clínicos y reporte
CREATE VIEW vw_resultados_paciente AS
SELECT r.id_resultado, p.id_paciente, p.nombre + ' ' + p.apellidos AS paciente,
       DATEDIFF(YEAR, p.fecha_nacimiento, GETDATE()) AS edad, i.siglas AS instrumento,
       CAST(e.fecha_completada AS DATE) AS fecha_aplicacion, r.puntaje, g.categoria, g.recomendacion,
       r.interpretacion, r.retroalimentacion_autorizada
FROM resultado r
JOIN evaluacion e ON e.id_evaluacion = r.id_evaluacion
JOIN paciente p ON p.id_paciente = e.id_paciente
JOIN instrumento i ON i.id_instrumento = e.id_instrumento
JOIN guia_evaluacion g ON g.id_guia = r.id_guia;
GO
-- S-08 Evaluaciones pendientes y vencidas
CREATE VIEW vw_evaluaciones_pendientes AS
SELECT e.id_evaluacion, e.id_psicologo, p.nombre + ' ' + p.apellidos AS paciente, i.siglas AS instrumento,
       e.fecha_asignacion, e.fecha_limite,
       CASE WHEN e.fecha_limite < CAST(GETDATE() AS DATE) THEN 'VENCIDA' ELSE e.estado END AS situacion,
       (SELECT COUNT(*) FROM respuesta r WHERE r.id_evaluacion = e.id_evaluacion) * 100 /
       NULLIF((SELECT COUNT(*) FROM pregunta q WHERE q.id_instrumento = e.id_instrumento), 0) AS avance_pct
FROM evaluacion e
JOIN paciente p ON p.id_paciente = e.id_paciente
JOIN instrumento i ON i.id_instrumento = e.id_instrumento
WHERE e.estado <> 'COMPLETADA';
GO
-- S-09 Estadística de alertas
CREATE VIEW vw_estadistica_alertas AS
SELECT a.nivel_riesgo, a.origen, COUNT(*) AS alertas,
       AVG(DATEDIFF(MINUTE, n.fecha_envio, at.fecha_atencion)) AS minutos_promedio_atencion,
       SUM(CASE WHEN a.estado = 'ESCALADA' OR n.canal = 'SMS' THEN 1 ELSE 0 END) AS escaladas
FROM alerta a
JOIN notificacion n ON n.id_notificacion = a.id_notificacion
LEFT JOIN atencion_alerta at ON at.id_notificacion = a.id_notificacion
GROUP BY a.nivel_riesgo, a.origen;
GO

-- ===================== DATOS DE EJEMPLO (ficticios) =====================
INSERT INTO usuario (correo, contrasena_hash, rol) VALUES
 ('christian.martinez@correo.com', '$2b$12$ejemploHashPsicologo01', 'PSICOLOGO'),
 ('laura.perez@correo.com',        '$2b$12$ejemploHashPsicologo02', 'PSICOLOGO'),
 ('mafer.lopez@correo.com',        '$2b$12$ejemploHashPaciente001', 'PACIENTE'),
 ('jorge.ramirez@correo.com',      '$2b$12$ejemploHashPaciente002', 'PACIENTE'),
 ('lucia.hernandez@correo.com',    '$2b$12$ejemploHashPaciente003', 'PACIENTE'),
 ('carlos.mendoza@correo.com',     '$2b$12$ejemploHashPaciente004', 'PACIENTE');
INSERT INTO token_acceso (id_usuario, tipo, codigo, fecha_expira, usado) VALUES
 (3, 'INVITACION', 'SNT4821', '2026-09-08', 1), (5, 'INVITACION', 'SNT7730', '2026-11-20', 0);
INSERT INTO psicologo (id_usuario, nombre, apellidos, cedula_profesional, especialidad, telefono) VALUES
 (1, 'Christian Alejandro', 'Martínez Leyva', '12345678', 'Psicología clínica', '6620000009'),
 (2, 'Laura', 'Pérez Soto', '87654321', 'Psicología clínica', '6620000010');
UPDATE psicologo SET id_psicologo_guardia = 2 WHERE id_psicologo = 1;
INSERT INTO paciente (id_usuario, id_psicologo, nombre, apellidos, fecha_nacimiento, genero, telefono, contacto_emergencia_nombre, contacto_emergencia_telefono, fecha_registro) VALUES
 (3, 1, 'María Fernanda', 'López García', '2002-03-14', 'FEMENINO', '6620000000', 'Ana López', '6620000020', '2026-09-01'),
 (4, 1, 'Jorge', 'Ramírez Ortiz', '1995-07-02', 'MASCULINO', '6620000001', NULL, NULL, '2026-09-10'),
 (5, 1, 'Lucía', 'Hernández Ruiz', '2007-01-25', 'FEMENINO', '6620000002', 'Rosa Ruiz', '6620000021', '2026-10-01'),
 (6, 1, 'Carlos', 'Mendoza Vega', '1981-11-30', 'MASCULINO', '6620000003', NULL, NULL, '2026-08-20');
INSERT INTO version_terminos (version, texto_terminos, fecha_publicacion) VALUES
 ('1.2', N'Términos de uso y aviso de privacidad de SentIA (texto completo)…', '2026-08-15');
INSERT INTO consentimiento (id_paciente, id_version, estado, fecha_firma) VALUES
 (1, 1, 'ACEPTADO', '2026-09-01T18:05:00'), (2, 1, 'ACEPTADO', '2026-09-10T10:12:00'), (3, 1, 'PENDIENTE', NULL), (4, 1, 'ACEPTADO', '2026-08-20T09:40:00');
INSERT INTO expediente_clinico (id_paciente, fecha_apertura, motivo_consulta, diagnostico, estado) VALUES
 (1, '2026-09-01', N'Crisis de ansiedad recurrentes y problemas de sueño.', N'Trastorno de ansiedad generalizada (en evaluación).', 'ABIERTO'),
 (2, '2026-09-10', N'Estrés laboral.', NULL, 'ABIERTO'),
 (3, '2026-10-01', N'Tristeza persistente.', NULL, 'ABIERTO'),
 (4, '2026-08-20', N'Duelo.', N'Duelo complicado.', 'ABIERTO');
INSERT INTO nota_evolucion (id_expediente, id_psicologo, fecha, tipo_nota, texto) VALUES
 (1, 1, '2026-10-30T17:00:00', 'SESION', N'Mejora en higiene del sueño; continúa con ejercicios de respiración.'),
 (1, 1, '2026-11-13T23:10:00', 'LLAMADA', N'Alerta crítica atendida por llamada; paciente estable. Se agenda sesión presencial.');
INSERT INTO instrumento (nombre, siglas, tipo, metodo_calificacion, version_autorizada) VALUES
 ('Inventario de Ansiedad de Beck', 'BAI', 'Ansiedad', 'Suma simple de reactivos (0-3)', 'Español 1.0'),
 ('Escala de ansiedad de Hamilton', 'HAM-A', 'Ansiedad', 'Suma de 14 ítems (0-4)', 'Español 1.0'),
 ('Cuestionario de experiencias traumáticas', 'TQ', 'Trauma', 'Conteo de síntomas presentes', 'Español 1.0'),
 ('Escala de 8 ítems para resultados de tratamiento TEPT', 'TOP-8', 'TEPT', 'Suma de 8 ítems (0-4)', 'Español 1.0');
INSERT INTO pregunta (id_instrumento, numero, texto, tipo_respuesta, valor_minimo, valor_maximo) VALUES
 (1, 1, N'Torpe o entumecido', 'LIKERT', 0, 3),
 (1, 2, N'Acalorado', 'LIKERT', 0, 3),
 (1, 3, N'Con temblor en las piernas', 'LIKERT', 0, 3),
 (1, 4, N'Incapaz de relajarse', 'LIKERT', 0, 3),
 (1, 5, N'Reactivo 5 del BAI', 'LIKERT', 0, 3),
 (1, 6, N'Reactivo 6 del BAI', 'LIKERT', 0, 3),
 (1, 7, N'Reactivo 7 del BAI', 'LIKERT', 0, 3),
 (1, 8, N'Reactivo 8 del BAI', 'LIKERT', 0, 3),
 (1, 9, N'Reactivo 9 del BAI', 'LIKERT', 0, 3),
 (1, 10, N'Reactivo 10 del BAI', 'LIKERT', 0, 3),
 (1, 11, N'Reactivo 11 del BAI', 'LIKERT', 0, 3),
 (1, 12, N'Reactivo 12 del BAI', 'LIKERT', 0, 3),
 (1, 13, N'Reactivo 13 del BAI', 'LIKERT', 0, 3),
 (1, 14, N'Reactivo 14 del BAI', 'LIKERT', 0, 3),
 (1, 15, N'Reactivo 15 del BAI', 'LIKERT', 0, 3),
 (1, 16, N'Reactivo 16 del BAI', 'LIKERT', 0, 3),
 (1, 17, N'Reactivo 17 del BAI', 'LIKERT', 0, 3),
 (1, 18, N'Reactivo 18 del BAI', 'LIKERT', 0, 3),
 (1, 19, N'Reactivo 19 del BAI', 'LIKERT', 0, 3),
 (1, 20, N'Reactivo 20 del BAI', 'LIKERT', 0, 3),
 (1, 21, N'Reactivo 21 del BAI', 'LIKERT', 0, 3),
 (2, 1, N'Ítem 1 de la HAM-A', 'LIKERT', 0, 4),
 (2, 2, N'Ítem 2 de la HAM-A', 'LIKERT', 0, 4),
 (2, 3, N'Ítem 3 de la HAM-A', 'LIKERT', 0, 4),
 (2, 4, N'Ítem 4 de la HAM-A', 'LIKERT', 0, 4),
 (2, 5, N'Ítem 5 de la HAM-A', 'LIKERT', 0, 4),
 (2, 6, N'Ítem 6 de la HAM-A', 'LIKERT', 0, 4),
 (2, 7, N'Ítem 7 de la HAM-A', 'LIKERT', 0, 4),
 (2, 8, N'Ítem 8 de la HAM-A', 'LIKERT', 0, 4),
 (2, 9, N'Ítem 9 de la HAM-A', 'LIKERT', 0, 4),
 (2, 10, N'Ítem 10 de la HAM-A', 'LIKERT', 0, 4),
 (2, 11, N'Ítem 11 de la HAM-A', 'LIKERT', 0, 4),
 (2, 12, N'Ítem 12 de la HAM-A', 'LIKERT', 0, 4),
 (2, 13, N'Ítem 13 de la HAM-A', 'LIKERT', 0, 4),
 (2, 14, N'Ítem 14 de la HAM-A', 'LIKERT', 0, 4),
 (4, 1, N'Ítem 1 del TOP-8', 'LIKERT', 0, 4),
 (4, 2, N'Ítem 2 del TOP-8', 'LIKERT', 0, 4),
 (4, 3, N'Ítem 3 del TOP-8', 'LIKERT', 0, 4),
 (4, 4, N'Ítem 4 del TOP-8', 'LIKERT', 0, 4),
 (4, 5, N'Ítem 5 del TOP-8', 'LIKERT', 0, 4),
 (4, 6, N'Ítem 6 del TOP-8', 'LIKERT', 0, 4),
 (4, 7, N'Ítem 7 del TOP-8', 'LIKERT', 0, 4),
 (4, 8, N'Ítem 8 del TOP-8', 'LIKERT', 0, 4),
 (3, 1, N'Acontecimiento o síntoma 1 del TQ', 'SI_NO', 0, 1),
 (3, 2, N'Acontecimiento o síntoma 2 del TQ', 'SI_NO', 0, 1),
 (3, 3, N'Acontecimiento o síntoma 3 del TQ', 'SI_NO', 0, 1),
 (3, 4, N'Acontecimiento o síntoma 4 del TQ', 'SI_NO', 0, 1),
 (3, 5, N'Acontecimiento o síntoma 5 del TQ', 'SI_NO', 0, 1),
 (3, 6, N'Acontecimiento o síntoma 6 del TQ', 'SI_NO', 0, 1);
INSERT INTO guia_evaluacion (id_instrumento, puntaje_min, puntaje_max, categoria, descripcion, recomendacion, indica_riesgo) VALUES
 (1, 0, 7, 'Mínima', N'Ansiedad mínima.', N'Mantener seguimiento habitual.', 0),
 (1, 8, 15, 'Leve', N'Ansiedad leve.', N'Técnicas de relajación.', 0),
 (1, 16, 25, 'Moderada', N'Ansiedad moderada.', N'Intervención focalizada.', 0),
 (1, 26, 63, 'Severa', N'Ansiedad severa.', N'Intervención focalizada y reevaluar en 2 semanas.', 1),
 (2, 0, 17, 'Leve', N'Ansiedad leve.', N'Seguimiento.', 0),
 (2, 18, 24, 'Moderada', N'Ansiedad moderada.', N'Intervención.', 0),
 (2, 25, 56, 'Severa', N'Ansiedad severa.', N'Intervención intensiva.', 1),
 (4, 0, 15, 'Moderada', N'Síntomas moderados.', N'Continuar tratamiento.', 0),
 (4, 16, 32, 'Severa', N'Síntomas severos.', N'Revisar plan terapéutico.', 1);
INSERT INTO evaluacion (id_paciente, id_instrumento, id_psicologo, fecha_asignacion, fecha_limite, repetir_cada_dias, recordatorio_horas, estado, fecha_completada) VALUES
 (1, 1, 1, '2026-11-09', '2026-11-16', 14, 24, 'COMPLETADA', '2026-11-12T20:30:00'),
 (4, 2, 1, '2026-11-01', '2026-11-08', NULL, 24, 'PENDIENTE', NULL),
 (3, 3, 1, '2026-11-03', '2026-11-10', NULL, 24, 'PENDIENTE', NULL),
 (2, 1, 1, '2026-11-10', '2026-11-15', NULL, 24, 'INICIADA', NULL),
 (1, 2, 1, '2026-11-13', '2026-11-20', NULL, 24, 'PENDIENTE', NULL);
INSERT INTO respuesta (id_evaluacion, id_pregunta, valor, fecha_respuesta) VALUES
 (1, 1, 1, '2026-11-12T20:05:00'),
 (1, 2, 2, '2026-11-12T20:06:00'),
 (1, 3, 1, '2026-11-12T20:07:00'),
 (1, 4, 3, '2026-11-12T20:08:00'),
 (1, 5, 3, '2026-11-12T20:09:00'),
 (1, 6, 2, '2026-11-12T20:10:00'),
 (1, 7, 1, '2026-11-12T20:11:00'),
 (1, 8, 1, '2026-11-12T20:12:00'),
 (1, 9, 2, '2026-11-12T20:13:00'),
 (1, 10, 1, '2026-11-12T20:14:00'),
 (1, 11, 1, '2026-11-12T20:15:00'),
 (1, 12, 0, '2026-11-12T20:16:00'),
 (1, 13, 1, '2026-11-12T20:17:00'),
 (1, 14, 2, '2026-11-12T20:18:00'),
 (1, 15, 1, '2026-11-12T20:19:00'),
 (1, 16, 1, '2026-11-12T20:20:00'),
 (1, 17, 0, '2026-11-12T20:21:00'),
 (1, 18, 1, '2026-11-12T20:22:00'),
 (1, 19, 2, '2026-11-12T20:23:00'),
 (1, 20, 1, '2026-11-12T20:24:00'),
 (1, 21, 0, '2026-11-12T20:25:00'),
 (4, 1, 1, '2026-11-11T19:01:00'),
 (4, 2, 2, '2026-11-11T19:02:00'),
 (4, 3, 2, '2026-11-11T19:03:00'),
 (4, 4, 1, '2026-11-11T19:04:00'),
 (4, 5, 1, '2026-11-11T19:05:00'),
 (4, 6, 2, '2026-11-11T19:06:00'),
 (4, 7, 1, '2026-11-11T19:07:00'),
 (4, 8, 0, '2026-11-11T19:08:00'),
 (4, 9, 1, '2026-11-11T19:09:00'),
 (4, 10, 1, '2026-11-11T19:10:00'),
 (4, 11, 2, '2026-11-11T19:11:00'),
 (4, 12, 1, '2026-11-11T19:12:00');
INSERT INTO resultado (id_evaluacion, id_guia, puntaje, interpretacion, retroalimentacion_autorizada, fecha_resultado)
 SELECT 1, g.id_guia, SUM(r.valor), N'Síntomas de ansiedad severos, con repunte respecto a la evaluación anterior.', 1, '2026-11-12T20:30:00'
 FROM respuesta r JOIN guia_evaluacion g ON g.id_instrumento = 1 AND 27 BETWEEN g.puntaje_min AND g.puntaje_max
 WHERE r.id_evaluacion = 1 GROUP BY g.id_guia;
INSERT INTO registro_animo (id_paciente, fecha_hora, valor) VALUES (1, '2026-11-13T08:00:00', 2), (1, '2026-11-12T08:10:00', 3), (2, '2026-11-13T09:00:00', 4);
INSERT INTO sesion (id_paciente, fecha_inicio, fecha_fin, estado, emocion_detectada, nivel_riesgo) VALUES
 (1, '2026-11-13T22:30:00', NULL, 'ACTIVA', 'Desesperanza', 'CRITICO'),
 (2, '2026-11-13T22:35:00', NULL, 'ACTIVA', 'Ansiedad', 'ALTO'),
 (3, '2026-11-13T22:20:00', NULL, 'ACTIVA', 'Tristeza', 'MEDIO'),
 (4, '2026-11-13T21:50:00', NULL, 'INACTIVA', 'Neutral', 'BAJO');
INSERT INTO mensaje (id_sesion, emisor, texto, fecha_hora) VALUES
 (1, 'SENTIA', N'Hola María, ¿cómo te fue hoy?', '2026-11-13T22:30:00'),
 (1, 'PACIENTE', N'Muy mal, siento que nada tiene sentido.', '2026-11-13T22:46:00'),
 (2, 'PACIENTE', N'Sigo con mucha ansiedad.', '2026-11-13T22:43:00'),
 (3, 'PACIENTE', N'Hoy me siento triste.', '2026-11-13T22:41:00'),
 (4, 'PACIENTE', N'Todo tranquilo.', '2026-11-13T22:20:00');
INSERT INTO notificacion (id_usuario, tipo, canal, mensaje, fecha_envio, leida) VALUES
 (3, 'INSTRUMENTO', 'PUSH', N'Tu psicólogo te asignó el BAI. Fecha límite: 16/11/2026.', '2026-11-09T10:00:00', 1),
 (1, 'RESULTADO', 'PANTALLA', N'Resultado nuevo de María Fernanda López (BAI).', '2026-11-12T20:30:00', 1),
 (1, 'ALERTA', 'PANTALLA', N'Alerta CRÍTICA: María Fernanda López.', '2026-11-13T22:47:00', 1),
 (1, 'ALERTA', 'PANTALLA', N'Alerta ALTA: Jorge Ramírez Ortiz.', '2026-11-13T22:44:00', 0),
 (6, 'RECORDATORIO', 'PUSH', N'Tienes una evaluación pendiente (HAM-A).', '2026-11-07T09:00:00', 0);
INSERT INTO alerta (id_notificacion, id_paciente, id_sesion, id_resultado, origen, nivel_riesgo, prioridad, estado) VALUES
 (3, 1, 1, NULL, 'CONVERSACION', 'CRITICO', 1, 'ATENDIDA'),
 (4, 2, 2, NULL, 'CONVERSACION', 'ALTO', 2, 'ENVIADA');
INSERT INTO atencion_alerta (id_notificacion, id_psicologo, accion, fecha_atencion, nota, nivel_riesgo_posterior, requiere_seguimiento) VALUES
 (3, 1, 'Llamada telefónica al paciente', '2026-11-13T22:51:00', N'Contención verbal; se acordó sesión presencial mañana 9:00 h.', 'MEDIO', 1);
INSERT INTO bitacora (id_usuario, tipo_evento, detalle, fecha_hora, ip_origen) VALUES
 (1, 'ACCESO', N'Inicio de sesión en software de monitoreo', '2026-11-13T22:40:00', '192.168.1.20'),
 (3, 'ACCESO', N'Inicio de sesión en app', '2026-11-13T22:29:00', '10.0.0.15'),
 (1, 'OPERACION', N'Atención de alerta #3 registrada', '2026-11-13T22:51:00', '192.168.1.20'),
 (NULL, 'ERROR', N'Reintento de envío push (servicio no disponible)', '2026-11-13T21:00:00', NULL);
GO
