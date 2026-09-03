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

    IF OBJECT_ID(N'dbo.PedidoSapHistorial', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.PedidoSapHistorial(
        idPedidoSapHistorial bigint IDENTITY CONSTRAINT PK_PedidoSapHistorial PRIMARY KEY,
        sapDocEntry int NOT NULL CONSTRAINT UQ_PedidoSapHistorial_docEntry UNIQUE,
        numeroPedido nvarchar(100) NOT NULL,
        fechaHoraPedido datetime2(3) NULL,
        nombreVendedor nvarchar(200) NULL,
        cerradoDetectadoEn datetime2(3) NOT NULL
          CONSTRAINT DF_PedidoSapHistorial_cerrado DEFAULT SYSUTCDATETIME(),
        creadoEn datetime2(3) NOT NULL
          CONSTRAINT DF_PedidoSapHistorial_creado DEFAULT SYSUTCDATETIME()
      );
      CREATE INDEX IX_PedidoSapHistorial_fecha
        ON dbo.PedidoSapHistorial(fechaHoraPedido DESC, sapDocEntry DESC);
    END;

    IF OBJECT_ID(N'dbo.PedidoSapHistorialDetalle', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.PedidoSapHistorialDetalle(
        idDetalleSapHistorial bigint IDENTITY
          CONSTRAINT PK_PedidoSapHistorialDetalle PRIMARY KEY,
        idPedidoSapHistorial bigint NOT NULL
          CONSTRAINT FK_PedidoSapHistorialDetalle_pedido
          REFERENCES dbo.PedidoSapHistorial(idPedidoSapHistorial),
        numeroLinea int NOT NULL,
        codigoArticulo nvarchar(100) NULL,
        descripcion nvarchar(500) NULL,
        cantidad decimal(19,6) NULL,
        codigoAlmacen nvarchar(16) NULL,
        nombreAlmacen nvarchar(200) NULL,
        CONSTRAINT UQ_PedidoSapHistorialDetalle_linea
          UNIQUE(idPedidoSapHistorial, numeroLinea)
      );
      CREATE INDEX IX_PedidoSapHistorialDetalle_almacen
        ON dbo.PedidoSapHistorialDetalle(codigoAlmacen, idPedidoSapHistorial);
    END;

    IF OBJECT_ID(N'dbo.ControlSincronizacionSap', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.ControlSincronizacionSap(
        clave varchar(50) CONSTRAINT PK_ControlSincronizacionSap PRIMARY KEY,
        ultimaConsultaEn datetime2(3) NULL
      );
    END;
    IF NOT EXISTS (SELECT 1 FROM dbo.ControlSincronizacionSap
      WHERE clave = 'HISTORIAL_CERRADOS')
      INSERT dbo.ControlSincronizacionSap(clave, ultimaConsultaEn)
        VALUES('HISTORIAL_CERRADOS', NULL);

    IF NOT EXISTS (SELECT 1 FROM dbo.MigracionEsquema WHERE versionMigracion = 8)
      INSERT dbo.MigracionEsquema(versionMigracion, nombre)
        VALUES(8, N'historial local de pedidos cerrados en SAP');
  `);
  console.info('Migración 8 aplicada únicamente en PedidosBodega.');
} finally {
  await cerrarConexionPedidosBodega();
}
