import 'dotenv/config';
import {
  cerrarConexionPedidosBodega, inicializarConexionPedidosBodega, obtenerPoolPedidosBodega,
} from '../src/infraestructura/sql/conexionPedidosBodega.js';

await inicializarConexionPedidosBodega();
try {
  await obtenerPoolPedidosBodega().request().query(`
    IF DB_NAME() <> N'PedidosBodega' THROW 51000, 'Base no autorizada.', 1;
    SET XACT_ABORT ON;
    BEGIN TRANSACTION;

    IF OBJECT_ID(N'dbo.RolAplicacion', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.RolAplicacion (
        idRol uniqueidentifier NOT NULL CONSTRAINT PK_RolAplicacion PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
        codigo nvarchar(40) NOT NULL CONSTRAINT UQ_RolAplicacion_codigo UNIQUE,
        nombre nvarchar(80) NOT NULL,
        descripcion nvarchar(300) NOT NULL,
        activo bit NOT NULL CONSTRAINT DF_RolAplicacion_activo DEFAULT 1,
        creadoEn datetime2(3) NOT NULL CONSTRAINT DF_RolAplicacion_creado DEFAULT SYSUTCDATETIME()
      );
    END;

    IF NOT EXISTS (SELECT 1 FROM dbo.RolAplicacion WHERE codigo = N'ADMINISTRADOR')
      INSERT dbo.RolAplicacion(codigo,nombre,descripcion) VALUES
        (N'ADMINISTRADOR',N'Administrador',N'Administración y operación completa autorizada.');
    IF NOT EXISTS (SELECT 1 FROM dbo.RolAplicacion WHERE codigo = N'OPERADOR_BODEGA')
      INSERT dbo.RolAplicacion(codigo,nombre,descripcion) VALUES
        (N'OPERADOR_BODEGA',N'Operador de bodega',N'Operación de pedidos e inventario.');
    IF NOT EXISTS (SELECT 1 FROM dbo.RolAplicacion WHERE codigo = N'CONSULTA')
      INSERT dbo.RolAplicacion(codigo,nombre,descripcion) VALUES
        (N'CONSULTA',N'Consulta',N'Consulta de pedidos, detalles e inventario.');

    IF COL_LENGTH(N'dbo.UsuarioAplicacion', N'nombreCompleto') IS NULL
      ALTER TABLE dbo.UsuarioAplicacion ADD nombreCompleto nvarchar(150) NULL;
    IF COL_LENGTH(N'dbo.UsuarioAplicacion', N'correo') IS NULL
      ALTER TABLE dbo.UsuarioAplicacion ADD correo nvarchar(254) NULL;
    IF COL_LENGTH(N'dbo.UsuarioAplicacion', N'rolId') IS NULL
      ALTER TABLE dbo.UsuarioAplicacion ADD rolId uniqueidentifier NULL;
    IF COL_LENGTH(N'dbo.UsuarioAplicacion', N'debeCambiarContrasena') IS NULL
      ALTER TABLE dbo.UsuarioAplicacion ADD debeCambiarContrasena bit NOT NULL
        CONSTRAINT DF_UsuarioAplicacion_cambiar DEFAULT 1;
    IF COL_LENGTH(N'dbo.UsuarioAplicacion', N'intentosFallidos') IS NULL
      ALTER TABLE dbo.UsuarioAplicacion ADD intentosFallidos int NOT NULL
        CONSTRAINT DF_UsuarioAplicacion_intentos DEFAULT 0;
    IF COL_LENGTH(N'dbo.UsuarioAplicacion', N'bloqueadoHasta') IS NULL
      ALTER TABLE dbo.UsuarioAplicacion ADD bloqueadoHasta datetime2(3) NULL;
    IF COL_LENGTH(N'dbo.UsuarioAplicacion', N'ultimoAcceso') IS NULL
      ALTER TABLE dbo.UsuarioAplicacion ADD ultimoAcceso datetime2(3) NULL;

    EXEC(N'UPDATE dbo.UsuarioAplicacion SET nombreCompleto = COALESCE(nombreCompleto, nombreVisible, nombreUsuario);');
    UPDATE usuario SET rolId = rol.idRol,
      codigoRol = rol.codigo
    FROM dbo.UsuarioAplicacion usuario
    JOIN dbo.RolAplicacion rol ON rol.codigo = CASE
      WHEN usuario.codigoRol IN (N'ADMINISTRADOR',N'OPERADOR_BODEGA',N'CONSULTA') THEN usuario.codigoRol
      ELSE N'ADMINISTRADOR' END
    WHERE usuario.rolId IS NULL;

    EXEC(N'ALTER TABLE dbo.UsuarioAplicacion ALTER COLUMN nombreCompleto nvarchar(150) NOT NULL;');
    EXEC(N'ALTER TABLE dbo.UsuarioAplicacion ALTER COLUMN rolId uniqueidentifier NOT NULL;');
    IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name=N'FK_UsuarioAplicacion_rol')
      EXEC(N'ALTER TABLE dbo.UsuarioAplicacion ADD CONSTRAINT FK_UsuarioAplicacion_rol
        FOREIGN KEY(rolId) REFERENCES dbo.RolAplicacion(idRol);');
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.UsuarioAplicacion') AND name=N'UX_UsuarioAplicacion_correo')
      EXEC(N'CREATE UNIQUE INDEX UX_UsuarioAplicacion_correo ON dbo.UsuarioAplicacion(correo) WHERE correo IS NOT NULL;');
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.UsuarioAplicacion') AND name=N'IX_UsuarioAplicacion_rol')
      EXEC(N'CREATE INDEX IX_UsuarioAplicacion_rol ON dbo.UsuarioAplicacion(rolId);');
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.UsuarioAplicacion') AND name=N'IX_UsuarioAplicacion_activo')
      CREATE INDEX IX_UsuarioAplicacion_activo ON dbo.UsuarioAplicacion(activo);

    IF USER_ID(N'pedidos_bodega_app') IS NOT NULL
    BEGIN
      GRANT SELECT ON dbo.RolAplicacion TO [pedidos_bodega_app];
      GRANT SELECT, INSERT, UPDATE ON dbo.UsuarioAplicacion TO [pedidos_bodega_app];
    END;
    IF NOT EXISTS (SELECT 1 FROM dbo.MigracionEsquema WHERE versionMigracion=6)
      INSERT dbo.MigracionEsquema(versionMigracion,nombre) VALUES(6,N'roles y administración de usuarios locales');
    COMMIT TRANSACTION;
  `);
  console.info('Migración 6 aplicada exclusivamente en PedidosBodega.');
} finally { await cerrarConexionPedidosBodega(); }
