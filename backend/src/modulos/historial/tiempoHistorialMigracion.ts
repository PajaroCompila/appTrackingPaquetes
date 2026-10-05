export const MIGRACION_TIEMPO_HISTORIAL = `
IF DB_NAME() <> N'PedidosBodega' THROW 51000, 'Base no autorizada.', 1;

IF OBJECT_ID(N'dbo.HistorialIngresoPedido', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.HistorialIngresoPedido(
    idOrigen nvarchar(150) NOT NULL
      CONSTRAINT PK_HistorialIngresoPedido PRIMARY KEY,
    historialIngresadoEn datetime2(3) NOT NULL
      CONSTRAINT DF_HistorialIngresoPedido_ingresado DEFAULT SYSUTCDATETIME()
  );
END;

INSERT dbo.HistorialIngresoPedido(idOrigen, historialIngresadoEn)
SELECT pedido.idOrigen,
  COALESCE(pedido.validadoDetectadoEn, pedido.cerradoDetectadoEn,
    pedido.despachadoEn, pedido.actualizadoEn)
FROM dbo.PedidoDespachado pedido
WHERE pedido.estadoLocal = 'VALIDADO'
  AND NOT EXISTS (SELECT 1 FROM dbo.HistorialIngresoPedido ingreso
    WHERE ingreso.idOrigen = pedido.idOrigen);

INSERT dbo.HistorialIngresoPedido(idOrigen, historialIngresadoEn)
SELECT CONCAT('SAP:', pedido.sapDocEntry),
  COALESCE(pedido.cerradoDetectadoEn, pedido.creadoEn)
FROM dbo.PedidoSapHistorial pedido
WHERE NOT EXISTS (SELECT 1 FROM dbo.HistorialIngresoPedido ingreso
  WHERE ingreso.idOrigen = CONCAT('SAP:', pedido.sapDocEntry));

INSERT dbo.HistorialIngresoPedido(idOrigen, historialIngresadoEn)
SELECT entrega.idOrigen, entrega.detectadoEn
FROM dbo.EntregaSapHistorial entrega
WHERE NOT EXISTS (SELECT 1 FROM dbo.HistorialIngresoPedido ingreso
  WHERE ingreso.idOrigen = entrega.idOrigen);

IF NOT EXISTS (SELECT 1 FROM dbo.MigracionEsquema WHERE versionMigracion = 19)
  INSERT dbo.MigracionEsquema(versionMigracion, nombre)
  VALUES(19, N'marca persistente de ingreso a historial para tiempo total');

IF DATABASE_PRINCIPAL_ID(N'pedidos_bodega_app') IS NOT NULL
BEGIN
  GRANT SELECT, INSERT ON dbo.HistorialIngresoPedido TO [pedidos_bodega_app];
END;
`;
