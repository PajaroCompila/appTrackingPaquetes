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

    IF COL_LENGTH(N'dbo.PedidoDespachado', N'validadoDetectadoEn') IS NULL
      ALTER TABLE dbo.PedidoDespachado ADD validadoDetectadoEn datetime2(3) NULL;
    IF COL_LENGTH(N'dbo.PedidoDespachado', N'codigoSucursal') IS NULL
      ALTER TABLE dbo.PedidoDespachado ADD codigoSucursal nvarchar(16) NULL;

    DECLARE @restriccion sysname;
    SELECT @restriccion = cc.name
    FROM sys.check_constraints cc
    WHERE cc.parent_object_id = OBJECT_ID(N'dbo.PedidoDespachado')
      AND cc.name = N'CK_PedidoDespachado_estado';
    IF @restriccion IS NOT NULL
      ALTER TABLE dbo.PedidoDespachado DROP CONSTRAINT CK_PedidoDespachado_estado;

    ALTER TABLE dbo.PedidoDespachado ADD CONSTRAINT CK_PedidoDespachado_estado
      CHECK (estadoLocal IN ('DESPACHADO', 'VALIDADO', 'ENTREGADO'));

    IF NOT EXISTS (SELECT 1 FROM sys.indexes
      WHERE object_id = OBJECT_ID(N'dbo.PedidoDespachado')
        AND name = N'IX_PedidoDespachado_estado_validado')
      CREATE INDEX IX_PedidoDespachado_estado_validado
        ON dbo.PedidoDespachado(estadoLocal, validadoDetectadoEn DESC, idOrigen);

    IF NOT EXISTS (SELECT 1 FROM dbo.MigracionEsquema WHERE versionMigracion = 5)
      INSERT dbo.MigracionEsquema(versionMigracion, nombre)
        VALUES(5, N'flujo despachado a validado local');
  `);
  console.info('Migración 5 aplicada únicamente en PedidosBodega.');
} finally {
  await cerrarConexionPedidosBodega();
}
