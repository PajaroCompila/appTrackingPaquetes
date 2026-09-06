USE TrackingPaquetes;
GO

IF OBJECT_ID(N'dbo.Envios', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Envios
    (
        envioId INT IDENTITY(1, 1) NOT NULL,
        numeroGuia VARCHAR(20) NOT NULL,
        puntoOrigenId INT NOT NULL,
        puntoDestinoId INT NOT NULL,
        usuarioQueRegistraId INT NOT NULL,
        nombreRemitente NVARCHAR(120) NOT NULL,
        telefonoRemitente VARCHAR(30) NOT NULL,
        nombreDestinatario NVARCHAR(120) NOT NULL,
        telefonoDestinatario VARCHAR(30) NOT NULL,
        descripcion NVARCHAR(250) NOT NULL,
        cantidadPaquetes INT NOT NULL,
        estadoActual VARCHAR(20) NOT NULL CONSTRAINT DF_Envios_estadoActual DEFAULT ('registrado'),
        fechaCreacion DATETIME2(0) NOT NULL CONSTRAINT DF_Envios_fechaCreacion DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT PK_Envios PRIMARY KEY (envioId),
        CONSTRAINT UQ_Envios_numeroGuia UNIQUE (numeroGuia),
        CONSTRAINT FK_Envios_origen FOREIGN KEY (puntoOrigenId) REFERENCES dbo.Sucursales(sucursalId),
        CONSTRAINT FK_Envios_destino FOREIGN KEY (puntoDestinoId) REFERENCES dbo.Sucursales(sucursalId),
        CONSTRAINT FK_Envios_usuario FOREIGN KEY (usuarioQueRegistraId) REFERENCES dbo.Usuarios(usuarioId),
        CONSTRAINT CK_Envios_sucursales CHECK (puntoOrigenId <> puntoDestinoId),
        CONSTRAINT CK_Envios_cantidad CHECK (cantidadPaquetes > 0),
        CONSTRAINT CK_Envios_estado CHECK (estadoActual IN ('registrado', 'en_transito', 'disponible', 'entregado', 'cancelado'))
    );
END;
GO