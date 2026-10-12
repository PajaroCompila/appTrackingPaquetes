export const MIGRACION_HISTORIAL_R1_SNAPSHOT = `
IF DB_NAME() <> N'PedidosBodega' THROW 51000, 'Base no autorizada.', 1;

IF OBJECT_ID(N'dbo.HistorialR1Snapshot', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.HistorialR1Snapshot(
    idOrigen nvarchar(150) NOT NULL CONSTRAINT PK_HistorialR1Snapshot PRIMARY KEY,
    codigoSucursal nvarchar(16) NOT NULL,
    folioPedido nvarchar(100) NOT NULL,
    numeroPedido nvarchar(100) NOT NULL,
    fechaHoraPedido datetime2(3) NULL,
    nombreVendedor nvarchar(200) NULL,
    esEspecial bit NOT NULL CONSTRAINT DF_HistorialR1Snapshot_especial DEFAULT 0,
    datos nvarchar(max) NOT NULL,
    activo bit NOT NULL CONSTRAINT DF_HistorialR1Snapshot_activo DEFAULT 1,
    sincronizadoEn datetime2(3) NOT NULL
      CONSTRAINT DF_HistorialR1Snapshot_sincronizado DEFAULT SYSUTCDATETIME(),
    CONSTRAINT CK_HistorialR1Snapshot_json CHECK (ISJSON(datos)=1)
  );
  CREATE INDEX IX_HistorialR1Snapshot_fecha
    ON dbo.HistorialR1Snapshot(fechaHoraPedido DESC, idOrigen);
  CREATE INDEX IX_HistorialR1Snapshot_numero
    ON dbo.HistorialR1Snapshot(numeroPedido, activo);
END;

IF USER_ID(N'pedidos_bodega_app') IS NOT NULL
  GRANT SELECT, INSERT, UPDATE ON dbo.HistorialR1Snapshot TO [pedidos_bodega_app];
`;
