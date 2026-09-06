USE TrackingPaquetes;
GO

IF OBJECT_ID(N'dbo.Sucursales', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Sucursales
    (
        sucursalId INT IDENTITY(1, 1) NOT NULL,
        nombre NVARCHAR(100) NOT NULL,
        codigo VARCHAR(20) NOT NULL,
        direccion NVARCHAR(200) NOT NULL,
        ciudad NVARCHAR(80) NOT NULL,
        telefono VARCHAR(30) NOT NULL,
        activo BIT NOT NULL CONSTRAINT DF_Sucursales_activo DEFAULT (1),
        fechaCreacion DATETIME2(0) NOT NULL CONSTRAINT DF_Sucursales_fechaCreacion DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT PK_Sucursales PRIMARY KEY (sucursalId),
        CONSTRAINT UQ_Sucursales_codigo UNIQUE (codigo),
        CONSTRAINT CK_Sucursales_nombre CHECK (LEN(LTRIM(RTRIM(nombre))) > 0),
        CONSTRAINT CK_Sucursales_codigo CHECK (LEN(LTRIM(RTRIM(codigo))) > 0),
        CONSTRAINT CK_Sucursales_direccion CHECK (LEN(LTRIM(RTRIM(direccion))) > 0),
        CONSTRAINT CK_Sucursales_ciudad CHECK (LEN(LTRIM(RTRIM(ciudad))) > 0),
        CONSTRAINT CK_Sucursales_telefono CHECK (LEN(LTRIM(RTRIM(telefono))) > 0)
    );
END;
GO