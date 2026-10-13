export const MIGRACION_PERSONAL_ASIGNABLE = `
IF DB_NAME() <> N'PedidosBodega' THROW 51000, 'Base no autorizada.', 1;
SET XACT_ABORT ON;
BEGIN TRANSACTION;
BEGIN TRY
  IF OBJECT_ID(N'dbo.PersonalAsignable', N'U') IS NULL
  BEGIN
    CREATE TABLE dbo.PersonalAsignable(
      idPersonal uniqueidentifier NOT NULL
        CONSTRAINT PK_PersonalAsignable PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
      codigoAsignacion nvarchar(100) COLLATE Modern_Spanish_100_CI_AI NOT NULL,
      nombre nvarchar(100) COLLATE Modern_Spanish_100_CI_AI NOT NULL,
      apellido nvarchar(100) COLLATE Modern_Spanish_100_CI_AI NOT NULL,
      nombreCompleto nvarchar(205) COLLATE Modern_Spanish_100_CI_AI NOT NULL,
      ambito varchar(20) NOT NULL CONSTRAINT DF_PersonalAsignable_ambito DEFAULT 'GENERAL',
      activo bit NOT NULL CONSTRAINT DF_PersonalAsignable_activo DEFAULT 1,
      fechaCreacion datetime2(3) NOT NULL
        CONSTRAINT DF_PersonalAsignable_fechaCreacion DEFAULT SYSUTCDATETIME(),
      creadoPor uniqueidentifier NULL,
      idUsuarioVinculado uniqueidentifier NULL,
      CONSTRAINT UQ_PersonalAsignable_codigo UNIQUE(codigoAsignacion),
      CONSTRAINT UQ_PersonalAsignable_ambito_nombre UNIQUE(ambito,nombreCompleto),
      CONSTRAINT CK_PersonalAsignable_nombre CHECK(LEN(LTRIM(RTRIM(nombre))) > 0),
      CONSTRAINT CK_PersonalAsignable_ambito CHECK(ambito IN ('GENERAL','ACALIX_JLARA','TCIR01','TTBM01')),
      CONSTRAINT FK_PersonalAsignable_creadoPor FOREIGN KEY(creadoPor)
        REFERENCES dbo.UsuarioAplicacion(idUsuario),
      CONSTRAINT FK_PersonalAsignable_usuarioVinculado FOREIGN KEY(idUsuarioVinculado)
        REFERENCES dbo.UsuarioAplicacion(idUsuario)
    );
    CREATE INDEX IX_PersonalAsignable_catalogo
      ON dbo.PersonalAsignable(activo,ambito,nombreCompleto)
      INCLUDE(codigoAsignacion,idUsuarioVinculado);
  END;

  DECLARE @Semilla TABLE(
    codigoAsignacion nvarchar(100) COLLATE Modern_Spanish_100_CI_AI,
    nombre nvarchar(100) COLLATE Modern_Spanish_100_CI_AI,
    apellido nvarchar(100) COLLATE Modern_Spanish_100_CI_AI,
    nombreCompleto nvarchar(205) COLLATE Modern_Spanish_100_CI_AI,
    ambito varchar(20),
    usuarioVinculado nvarchar(100) COLLATE Modern_Spanish_100_CI_AI
  );
  INSERT @Semilla VALUES
    (N'mperez',N'Marcos',N'Perez',N'Marcos Perez','GENERAL',N'mperez'),
    (N'gcruz',N'Gregorio',N'Cruz',N'Gregorio Cruz','GENERAL',N'gcruz'),
    (N'operdomo',N'Olvin',N'Perdomo',N'Olvin Perdomo','GENERAL',N'operdomo'),
    (N'omencia',N'Osmar',N'Mencia',N'Osmar Mencia','GENERAL',N'omencia'),
    (N'maperdomo',N'Manuel A.',N'Perdomo',N'Manuel A. Perdomo','GENERAL',N'maperdomo'),
    (N'osmith',N'Orlin',N'Smith',N'Orlin Smith','GENERAL',N'osmith'),
    (N'dvelasquez',N'Daniel',N'Velasquez',N'Daniel Velasquez','GENERAL',N'dvelasquez'),
    (N'acalix',N'Ana',N'Calix',N'Ana Calix','ACALIX_JLARA',N'acalix'),
    (N'jlara',N'Jorge',N'Lara',N'Jorge Lara','ACALIX_JLARA',N'jlara'),
    (N'tlopez',N'Tommy',N'López',N'Tommy López','TCIR01',N'tlopez'),
    (N'bodegatbm',N'Kevin',N'Carranza',N'Kevin Carranza','TTBM01',N'bodegatbm');

  INSERT dbo.PersonalAsignable(
    codigoAsignacion,nombre,apellido,nombreCompleto,ambito,idUsuarioVinculado)
  SELECT semilla.codigoAsignacion,semilla.nombre,semilla.apellido,semilla.nombreCompleto,
    semilla.ambito,usuario.idUsuario
  FROM @Semilla semilla
  LEFT JOIN dbo.UsuarioAplicacion usuario
    ON usuario.nombreUsuario COLLATE Modern_Spanish_100_CI_AI=semilla.usuarioVinculado
  WHERE NOT EXISTS(SELECT 1 FROM dbo.PersonalAsignable existente
    WHERE existente.codigoAsignacion=semilla.codigoAsignacion
       OR (existente.ambito=semilla.ambito AND existente.nombreCompleto=semilla.nombreCompleto));

  UPDATE personal SET idUsuarioVinculado=usuario.idUsuario
  FROM dbo.PersonalAsignable personal
  JOIN @Semilla semilla ON semilla.codigoAsignacion=personal.codigoAsignacion
  JOIN dbo.UsuarioAplicacion usuario
    ON usuario.nombreUsuario COLLATE Modern_Spanish_100_CI_AI=semilla.usuarioVinculado
  WHERE personal.idUsuarioVinculado IS NULL;

  ;WITH Historico AS(
    SELECT asignacion.usuarioAsignado codigoAsignacion,
      MAX(LTRIM(RTRIM(asignacion.nombreAsignado))) nombreCompleto
    FROM dbo.AsignacionArticuloPedido asignacion
    WHERE NULLIF(LTRIM(RTRIM(asignacion.usuarioAsignado)),N'') IS NOT NULL
      AND NULLIF(LTRIM(RTRIM(asignacion.nombreAsignado)),N'') IS NOT NULL
    GROUP BY asignacion.usuarioAsignado
  )
  INSERT dbo.PersonalAsignable(codigoAsignacion,nombre,apellido,nombreCompleto,ambito)
  SELECT historico.codigoAsignacion,
    CASE WHEN CHARINDEX(N' ',historico.nombreCompleto)>0
      THEN LEFT(historico.nombreCompleto,CHARINDEX(N' ',historico.nombreCompleto)-1)
      ELSE historico.nombreCompleto END,
    CASE WHEN CHARINDEX(N' ',historico.nombreCompleto)>0
      THEN SUBSTRING(historico.nombreCompleto,CHARINDEX(N' ',historico.nombreCompleto)+1,100)
      ELSE N'' END,
    historico.nombreCompleto,'GENERAL'
  FROM Historico historico
  WHERE NOT EXISTS(SELECT 1 FROM dbo.PersonalAsignable existente
    WHERE existente.codigoAsignacion=historico.codigoAsignacion COLLATE Modern_Spanish_100_CI_AI
       OR (existente.ambito='GENERAL' AND existente.nombreCompleto=
         historico.nombreCompleto COLLATE Modern_Spanish_100_CI_AI));

  IF USER_ID(N'pedidos_bodega_app') IS NOT NULL
    GRANT SELECT,INSERT,UPDATE ON dbo.PersonalAsignable TO [pedidos_bodega_app];

  IF NOT EXISTS(SELECT 1 FROM dbo.MigracionEsquema WHERE versionMigracion=20)
    INSERT dbo.MigracionEsquema(versionMigracion,nombre)
      VALUES(20,N'catálogo independiente de personal asignable');
  COMMIT;
END TRY
BEGIN CATCH
  IF @@TRANCOUNT>0 ROLLBACK;
  THROW;
END CATCH;
`;
