USE TrackingPaquetes;
GO
IF OBJECT_ID(N'dbo.Despachos', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.Despachos (
    despachoId INT IDENTITY(1,1) PRIMARY KEY,
    placa VARCHAR(15) NOT NULL,
    conductor NVARCHAR(120) NOT NULL,
    puntoOrigenId INT NOT NULL REFERENCES dbo.Sucursales(sucursalId),
    puntoDestinoId INT NOT NULL REFERENCES dbo.Sucursales(sucursalId),
    usuarioDespachaId INT NOT NULL REFERENCES dbo.Usuarios(usuarioId),
    estado VARCHAR(20) NOT NULL CONSTRAINT DF_Despachos_estado DEFAULT 'despachado',
    fechaSalida DATETIME2 NOT NULL CONSTRAINT DF_Despachos_fecha DEFAULT SYSUTCDATETIME(),
    fechaRecepcion DATETIME2 NULL,
    CONSTRAINT CK_Despachos_estado CHECK (estado IN ('despachado','recibido'))
  );
  CREATE TABLE dbo.DespachoPaquetes (
    despachoId INT NOT NULL REFERENCES dbo.Despachos(despachoId),
    envioId INT NOT NULL REFERENCES dbo.Envios(envioId),
    CONSTRAINT PK_DespachoPaquetes PRIMARY KEY (despachoId, envioId)
  );
END;
GO
