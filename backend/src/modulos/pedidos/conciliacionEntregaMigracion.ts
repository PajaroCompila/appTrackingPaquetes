export const MIGRACION_CONCILIACION_ENTREGAS = `
IF DB_NAME() <> N'PedidosBodega' THROW 51000, 'Base no autorizada.', 1;
IF OBJECT_ID(N'dbo.ConciliacionEntregaPedido',N'U') IS NULL
BEGIN
  CREATE TABLE dbo.ConciliacionEntregaPedido (
    idEntrega varchar(100) NOT NULL,
    lineaEntrega int NOT NULL,
    idPedido varchar(100) NOT NULL,
    partida varchar(20) NOT NULL,
    firma varchar(64) NOT NULL,
    cantidad decimal(19,6) NOT NULL,
    tipoRelacion varchar(40) NOT NULL,
    evidencia nvarchar(max) NOT NULL CHECK(ISJSON(evidencia)=1),
    detectadoEn datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
    revisadoEn datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_ConciliacionEntregaPedido PRIMARY KEY(idEntrega,lineaEntrega,idPedido,partida),
    CONSTRAINT FK_ConciliacionEntregaPedido_linea FOREIGN KEY(idEntrega,lineaEntrega)
      REFERENCES dbo.EntregaSapHistorialLinea(idOrigen,lineNum)
  );
  CREATE INDEX IX_ConciliacionEntregaPedido_pedido
    ON dbo.ConciliacionEntregaPedido(idPedido,partida,firma) INCLUDE(cantidad,idEntrega,lineaEntrega);
END;
IF COL_LENGTH('dbo.ConciliacionEntregaPedido','activa') IS NULL
  ALTER TABLE dbo.ConciliacionEntregaPedido ADD activa bit NOT NULL DEFAULT 1;
IF NOT EXISTS(SELECT 1 FROM dbo.MigracionEsquema WHERE versionMigracion=15)
  INSERT dbo.MigracionEsquema(versionMigracion,nombre) VALUES(15,N'conciliacion estructurada de entregas y pendientes R1');
`;
