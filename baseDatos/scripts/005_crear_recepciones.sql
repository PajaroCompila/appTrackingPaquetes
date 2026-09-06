USE TrackingPaquetes;
GO
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_Envios_estado')
    ALTER TABLE dbo.Envios DROP CONSTRAINT CK_Envios_estado;
ALTER TABLE dbo.Envios ADD CONSTRAINT CK_Envios_estado CHECK (estadoActual IN ('registrado','en_transito','recibido','cancelado'));
GO
IF OBJECT_ID(N'dbo.RecepcionesEnvio', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.RecepcionesEnvio (
    recepcionId INT IDENTITY(1,1) PRIMARY KEY,
    envioId INT NOT NULL REFERENCES dbo.Envios(envioId) ON DELETE CASCADE,
    usuarioRecibeId INT NOT NULL REFERENCES dbo.Usuarios(usuarioId),
    entregaFinal BIT NOT NULL DEFAULT(0),
    fechaRecepcion DATETIME2(0) NOT NULL DEFAULT(SYSUTCDATETIME())
  );
END;
GO
