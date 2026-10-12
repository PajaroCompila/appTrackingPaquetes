export const MIGRACION_REFERENCIA_PEDIDO_SAP_R1 = `
IF DB_NAME() <> N'PedidosBodega' THROW 51000, 'Base no autorizada.', 1;

IF OBJECT_ID(N'dbo.ReferenciaPedidoSapR1', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.ReferenciaPedidoSapR1(
    idOrigen nvarchar(150) NOT NULL CONSTRAINT PK_ReferenciaPedidoSapR1 PRIMARY KEY,
    codigoSucursal nvarchar(16) NOT NULL,
    folioPedido nvarchar(100) NOT NULL,
    sapDocEntry int NOT NULL,
    numeroPedidoSap nvarchar(100) NOT NULL,
    detectadoEn datetime2(3) NOT NULL
      CONSTRAINT DF_ReferenciaPedidoSapR1_detectado DEFAULT SYSUTCDATETIME(),
    actualizadoEn datetime2(3) NOT NULL
      CONSTRAINT DF_ReferenciaPedidoSapR1_actualizado DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_ReferenciaPedidoSapR1_sucursal_folio UNIQUE(codigoSucursal, folioPedido),
    CONSTRAINT UQ_ReferenciaPedidoSapR1_docentry UNIQUE(sapDocEntry)
  );
  CREATE INDEX IX_ReferenciaPedidoSapR1_numero
    ON dbo.ReferenciaPedidoSapR1(numeroPedidoSap, folioPedido);
END;

IF USER_ID(N'pedidos_bodega_app') IS NOT NULL
  GRANT SELECT, INSERT, UPDATE ON dbo.ReferenciaPedidoSapR1 TO [pedidos_bodega_app];
`;
