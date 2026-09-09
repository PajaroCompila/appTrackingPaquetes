import 'dotenv/config';
import {
  cerrarConexionPedidosBodega,
  inicializarConexionPedidosBodega,
  obtenerPoolPedidosBodega,
} from '../src/infraestructura/sql/conexionPedidosBodega.js';

await inicializarConexionPedidosBodega();
try {
  await obtenerPoolPedidosBodega().request().query(`
    IF DB_NAME() <> N'PedidosBodega' THROW 51000, 'Base no autorizada.', 1;
    SET XACT_ABORT ON;
    BEGIN TRANSACTION;

    IF OBJECT_ID(N'dbo.UsuarioAlmacenVisible', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.UsuarioAlmacenVisible (
        idUsuario uniqueidentifier NOT NULL,
        codigoAlmacen nvarchar(16) NOT NULL,
        creadoEn datetime2(3) NOT NULL
          CONSTRAINT DF_UsuarioAlmacenVisible_creadoEn DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_UsuarioAlmacenVisible PRIMARY KEY (idUsuario, codigoAlmacen),
        CONSTRAINT FK_UsuarioAlmacenVisible_usuario FOREIGN KEY (idUsuario)
          REFERENCES dbo.UsuarioAplicacion(idUsuario) ON DELETE CASCADE
      );
      CREATE INDEX IX_UsuarioAlmacenVisible_codigo
        ON dbo.UsuarioAlmacenVisible(codigoAlmacen, idUsuario);
    END;

    DECLARE @tommy uniqueidentifier = (
      SELECT TOP (1) idUsuario FROM dbo.UsuarioAplicacion
      WHERE LOWER(nombreUsuario) = N'tlopez'
         OR LOWER(nombreCompleto) = N'tommy lópez'
         OR LOWER(nombreCompleto) = N'tommy lopez'
      ORDER BY CASE WHEN LOWER(nombreUsuario) = N'tlopez' THEN 0 ELSE 1 END
    );
    IF @tommy IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM dbo.UsuarioAlmacenVisible WHERE idUsuario = @tommy
    )
    BEGIN
      INSERT dbo.UsuarioAlmacenVisible(idUsuario, codigoAlmacen) VALUES(@tommy, N'TCIR01');
    END;

    IF USER_ID(N'pedidos_bodega_app') IS NOT NULL
      GRANT SELECT, INSERT, DELETE ON dbo.UsuarioAlmacenVisible TO [pedidos_bodega_app];

    IF NOT EXISTS (SELECT 1 FROM dbo.MigracionEsquema WHERE versionMigracion = 12)
      INSERT dbo.MigracionEsquema(versionMigracion, nombre)
      VALUES(12, N'bodegas visibles por usuario');

    COMMIT TRANSACTION;
  `);
  console.info('Migración 12 aplicada exclusivamente en PedidosBodega.');
} finally {
  await cerrarConexionPedidosBodega();
}
