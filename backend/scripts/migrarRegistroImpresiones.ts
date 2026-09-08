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

    IF OBJECT_ID(N'dbo.ImpresionArticulo', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.ImpresionArticulo (
        idImpresion bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_ImpresionArticulo PRIMARY KEY,
        idOrigen nvarchar(150) NOT NULL,
        identificadorDetalle nvarchar(150) NOT NULL,
        cantidadImpresiones int NOT NULL CONSTRAINT DF_ImpresionArticulo_cantidad DEFAULT 1,
        primeraImpresionEn datetime2(3) NOT NULL CONSTRAINT DF_ImpresionArticulo_primera DEFAULT SYSUTCDATETIME(),
        ultimaImpresionEn datetime2(3) NOT NULL CONSTRAINT DF_ImpresionArticulo_ultima DEFAULT SYSUTCDATETIME(),
        idUltimoUsuario uniqueidentifier NOT NULL,
        CONSTRAINT UQ_ImpresionArticulo_identidad UNIQUE(idOrigen, identificadorDetalle),
        CONSTRAINT FK_ImpresionArticulo_usuario FOREIGN KEY(idUltimoUsuario)
          REFERENCES dbo.UsuarioAplicacion(idUsuario),
        CONSTRAINT CK_ImpresionArticulo_cantidad CHECK(cantidadImpresiones > 0)
      );
      CREATE INDEX IX_ImpresionArticulo_ultima
        ON dbo.ImpresionArticulo(ultimaImpresionEn DESC);
    END;

    IF USER_ID(N'pedidos_bodega_app') IS NOT NULL
      GRANT SELECT, INSERT, UPDATE ON dbo.ImpresionArticulo TO [pedidos_bodega_app];

    IF NOT EXISTS (SELECT 1 FROM dbo.MigracionEsquema WHERE versionMigracion = 10)
      INSERT dbo.MigracionEsquema(versionMigracion, nombre)
        VALUES(10, N'registro de impresiones por artículo');

    COMMIT TRANSACTION;
  `);
  console.info('Migración 10 aplicada únicamente en PedidosBodega.');
} finally {
  await cerrarConexionPedidosBodega();
}
