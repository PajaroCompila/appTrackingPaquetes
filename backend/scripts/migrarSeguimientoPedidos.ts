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

    IF OBJECT_ID(N'dbo.SeguimientoPedido', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.SeguimientoPedido (
        idOrigen nvarchar(150) NOT NULL CONSTRAINT PK_SeguimientoPedido PRIMARY KEY,
        origenPedido varchar(3) NOT NULL,
        fechaEntradaCola datetimeoffset(3) NOT NULL,
        codigoUsuarioOrigen nvarchar(50) NULL,
        excluidoSla bit NOT NULL CONSTRAINT DF_SeguimientoPedido_excluido DEFAULT 0,
        huellaActual nvarchar(max) NULL,
        modificadoEn datetimeoffset(3) NULL,
        modificadoPor nvarchar(200) NULL,
        observadoEn datetime2(3) NOT NULL CONSTRAINT DF_SeguimientoPedido_observado DEFAULT SYSUTCDATETIME(),
        actualizadoEn datetime2(3) NOT NULL CONSTRAINT DF_SeguimientoPedido_actualizado DEFAULT SYSUTCDATETIME()
      );
      CREATE INDEX IX_SeguimientoPedido_modificado ON dbo.SeguimientoPedido(modificadoEn, idOrigen);
    END;

    IF OBJECT_ID(N'dbo.SeguimientoPedidoDetalle', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.SeguimientoPedidoDetalle (
        idOrigen nvarchar(150) NOT NULL,
        identificadorDetalle nvarchar(150) NOT NULL,
        codigoArticulo nvarchar(100) NULL,
        descripcion nvarchar(500) NULL,
        cantidad decimal(19,6) NULL,
        codigoAlmacen nvarchar(16) NULL,
        activo bit NOT NULL CONSTRAINT DF_SeguimientoPedidoDetalle_activo DEFAULT 1,
        CONSTRAINT PK_SeguimientoPedidoDetalle PRIMARY KEY(idOrigen, identificadorDetalle),
        CONSTRAINT FK_SeguimientoPedidoDetalle_pedido FOREIGN KEY(idOrigen)
          REFERENCES dbo.SeguimientoPedido(idOrigen)
      );
    END;
    IF COL_LENGTH(N'dbo.SeguimientoPedidoDetalle', N'activo') IS NULL
      ALTER TABLE dbo.SeguimientoPedidoDetalle ADD activo bit NOT NULL
        CONSTRAINT DF_SeguimientoPedidoDetalle_activo DEFAULT 1;

    UPDATE dbo.SeguimientoPedido
      SET fechaEntradaCola = TODATETIMEOFFSET(observadoEn, '+00:00')
      WHERE origenPedido = 'R1';

    IF OBJECT_ID(N'dbo.ModificacionPedido', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.ModificacionPedido (
        idModificacion bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_ModificacionPedido PRIMARY KEY,
        idOrigen nvarchar(150) NOT NULL,
        detectadoEn datetimeoffset(3) NOT NULL,
        modificadoPor nvarchar(200) NULL,
        CONSTRAINT FK_ModificacionPedido_pedido FOREIGN KEY(idOrigen)
          REFERENCES dbo.SeguimientoPedido(idOrigen)
      );
      CREATE INDEX IX_ModificacionPedido_pedido ON dbo.ModificacionPedido(idOrigen, detectadoEn);
    END;

    IF OBJECT_ID(N'dbo.ModificacionPedidoDetalle', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.ModificacionPedidoDetalle (
        idModificacionDetalle bigint IDENTITY(1,1) NOT NULL
          CONSTRAINT PK_ModificacionPedidoDetalle PRIMARY KEY,
        idModificacion bigint NOT NULL,
        tipo varchar(12) NOT NULL,
        identificadorDetalle nvarchar(150) NOT NULL,
        codigoArticulo nvarchar(100) NULL,
        descripcion nvarchar(500) NULL,
        cantidadAnterior decimal(19,6) NULL,
        cantidadNueva decimal(19,6) NULL,
        codigoAlmacenAnterior nvarchar(16) NULL,
        codigoAlmacenNuevo nvarchar(16) NULL,
        CONSTRAINT FK_ModificacionPedidoDetalle_modificacion FOREIGN KEY(idModificacion)
          REFERENCES dbo.ModificacionPedido(idModificacion),
        CONSTRAINT CK_ModificacionPedidoDetalle_tipo
          CHECK (tipo IN ('AGREGADO', 'ELIMINADO', 'CANTIDAD', 'BODEGA'))
      );
    END;

    IF USER_ID(N'pedidos_bodega_app') IS NOT NULL
    BEGIN
      GRANT SELECT, INSERT, UPDATE ON dbo.SeguimientoPedido TO [pedidos_bodega_app];
      GRANT SELECT, INSERT, UPDATE ON dbo.SeguimientoPedidoDetalle TO [pedidos_bodega_app];
      GRANT SELECT, INSERT ON dbo.ModificacionPedido TO [pedidos_bodega_app];
      GRANT SELECT, INSERT ON dbo.ModificacionPedidoDetalle TO [pedidos_bodega_app];
    END;

    IF NOT EXISTS (SELECT 1 FROM dbo.MigracionEsquema WHERE versionMigracion = 13)
      INSERT dbo.MigracionEsquema(versionMigracion, nombre)
        VALUES(13, N'seguimiento de tiempos y cambios de pedidos');

    COMMIT TRANSACTION;
  `);
  console.info('Seguimiento de pedidos listo.');
} finally {
  await cerrarConexionPedidosBodega();
}
