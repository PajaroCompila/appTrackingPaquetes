import 'dotenv/config';
import {
  cerrarConexionPedidosBodega,
  inicializarConexionPedidosBodega,
  obtenerPoolPedidosBodega,
} from '../src/infraestructura/sql/conexionPedidosBodega.js';

await inicializarConexionPedidosBodega();
try {
  const pool = obtenerPoolPedidosBodega();
  await pool.request().query(`
    IF DB_NAME() <> N'PedidosBodega' THROW 51000, 'Base no autorizada.', 1;

    IF COL_LENGTH(N'dbo.PedidoDespachadoDetalle', N'idOrigen') IS NULL
      ALTER TABLE dbo.PedidoDespachadoDetalle ADD idOrigen nvarchar(150) NULL;
    IF COL_LENGTH(N'dbo.PedidoDespachadoDetalle', N'identificadorDetalle') IS NULL
      ALTER TABLE dbo.PedidoDespachadoDetalle ADD identificadorDetalle nvarchar(150) NULL;
    IF COL_LENGTH(N'dbo.PedidoDespachadoDetalle', N'idUsuario') IS NULL
      ALTER TABLE dbo.PedidoDespachadoDetalle ADD idUsuario uniqueidentifier NULL;
    IF COL_LENGTH(N'dbo.PedidoDespachadoDetalle', N'transferidoEn') IS NULL
      ALTER TABLE dbo.PedidoDespachadoDetalle ADD transferidoEn datetime2(3) NULL;
  `);

  await pool.request().query(`
    IF DB_NAME() <> N'PedidosBodega' THROW 51000, 'Base no autorizada.', 1;
    UPDATE detalle
      SET idOrigen = pedido.idOrigen,
          identificadorDetalle = COALESCE(detalle.identificadorDetalle, CONCAT(N'LEGACY:', detalle.numeroLinea)),
          idUsuario = pedido.idUsuario,
          transferidoEn = COALESCE(detalle.transferidoEn, detalle.creadoEn)
    FROM dbo.PedidoDespachadoDetalle detalle
    INNER JOIN dbo.PedidoDespachado pedido
      ON pedido.idPedidoDespachado = detalle.idPedidoDespachado
    WHERE detalle.idOrigen IS NULL
       OR detalle.identificadorDetalle IS NULL
       OR detalle.idUsuario IS NULL
       OR detalle.transferidoEn IS NULL;
  `);

  await pool.request().query(`
    IF DB_NAME() <> N'PedidosBodega' THROW 51000, 'Base no autorizada.', 1;
    ALTER TABLE dbo.PedidoDespachadoDetalle ALTER COLUMN idOrigen nvarchar(150) NOT NULL;
    ALTER TABLE dbo.PedidoDespachadoDetalle ALTER COLUMN identificadorDetalle nvarchar(150) NOT NULL;
    ALTER TABLE dbo.PedidoDespachadoDetalle ALTER COLUMN idUsuario uniqueidentifier NOT NULL;
    ALTER TABLE dbo.PedidoDespachadoDetalle ALTER COLUMN transferidoEn datetime2(3) NOT NULL;

    IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_PedidoDespachadoDetalle_usuario')
      ALTER TABLE dbo.PedidoDespachadoDetalle ADD CONSTRAINT FK_PedidoDespachadoDetalle_usuario
        FOREIGN KEY(idUsuario) REFERENCES dbo.UsuarioAplicacion(idUsuario);
    IF NOT EXISTS (SELECT 1 FROM sys.key_constraints WHERE name = N'UQ_PedidoDespachadoDetalle_origen_identidad')
      ALTER TABLE dbo.PedidoDespachadoDetalle ADD CONSTRAINT UQ_PedidoDespachadoDetalle_origen_identidad
        UNIQUE(idOrigen, identificadorDetalle);

    IF NOT EXISTS (SELECT 1 FROM dbo.MigracionEsquema WHERE versionMigracion = 4)
      INSERT dbo.MigracionEsquema(versionMigracion, nombre)
        VALUES(4, N'transferencia parcial por identidad de detalle');
  `);
  console.info('Migración 4 aplicada únicamente en PedidosBodega.');
} finally {
  await cerrarConexionPedidosBodega();
}
