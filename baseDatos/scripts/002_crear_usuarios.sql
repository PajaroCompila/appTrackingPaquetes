USE TrackingPaquetes;
GO

IF OBJECT_ID(N'dbo.Usuarios', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Usuarios
    (
        usuarioId INT IDENTITY(1, 1) NOT NULL,
        nombres NVARCHAR(80) NOT NULL,
        apellidos NVARCHAR(80) NOT NULL,
        nombreUsuario NVARCHAR(40) NOT NULL,
        correoElectronico NVARCHAR(160) NOT NULL,
        rol VARCHAR(20) NOT NULL,
        activo BIT NOT NULL CONSTRAINT DF_Usuarios_activo DEFAULT (1),
        contrasenaHash NVARCHAR(255) NOT NULL,
        debeCambiarContrasena BIT NOT NULL CONSTRAINT DF_Usuarios_debeCambiarContrasena DEFAULT (1),
        fechaCreacion DATETIME2(0) NOT NULL CONSTRAINT DF_Usuarios_fechaCreacion DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT PK_Usuarios PRIMARY KEY (usuarioId),
        CONSTRAINT UQ_Usuarios_nombreUsuario UNIQUE (nombreUsuario),
        CONSTRAINT UQ_Usuarios_correoElectronico UNIQUE (correoElectronico),
        CONSTRAINT CK_Usuarios_rol CHECK (rol IN ('usuario', 'supervisor', 'administrador')),
        CONSTRAINT CK_Usuarios_nombres CHECK (LEN(LTRIM(RTRIM(nombres))) > 0),
        CONSTRAINT CK_Usuarios_apellidos CHECK (LEN(LTRIM(RTRIM(apellidos))) > 0),
        CONSTRAINT CK_Usuarios_nombreUsuario CHECK (LEN(LTRIM(RTRIM(nombreUsuario))) > 0),
        CONSTRAINT CK_Usuarios_correoElectronico CHECK (LEN(LTRIM(RTRIM(correoElectronico))) > 0)
    );
END;
GO
