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

    IF COL_LENGTH(N'dbo.PedidoDespachado', N'cerradoDetectadoEn') IS NULL
      ALTER TABLE dbo.PedidoDespachado ADD cerradoDetectadoEn datetime2(3) NULL;

    DECLARE @restriccion sysname;
    SELECT @restriccion = cc.name
    FROM sys.check_constraints cc
    WHERE cc.parent_object_id = OBJECT_ID(N'dbo.PedidoDespachado')
      AND cc.name = N'CK_PedidoDespachado_estado';
    IF @restriccion IS NOT NULL
      ALTER TABLE dbo.PedidoDespachado DROP CONSTRAINT CK_PedidoDespachado_estado;

    ALTER TABLE dbo.PedidoDespachado ADD CONSTRAINT CK_PedidoDespachado_estado
      CHECK (estadoLocal IN ('DESPACHADO', 'VALIDADO', 'ENTREGADO', 'CERRADO'));

    IF NOT EXISTS (SELECT 1 FROM dbo.MigracionEsquema WHERE versionMigracion = 7)
      INSERT dbo.MigracionEsquema(versionMigracion, nombre)
        VALUES(7, N'omisión local de pedidos cerrados en R1');
  `);
  console.info('Migración 7 aplicada únicamente en PedidosBodega.');
} finally {
  await cerrarConexionPedidosBodega();
}
