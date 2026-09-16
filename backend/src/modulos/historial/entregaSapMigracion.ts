// Esta migración solo se ejecuta explícitamente contra la base local.
export const MIGRACION_ENTREGAS_SAP = `
IF DB_NAME() <> N'PedidosBodega' THROW 51000, 'Base no autorizada.', 1;
IF OBJECT_ID(N'dbo.EntregaSapHistorial', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.EntregaSapHistorial (
    idOrigen varchar(100) NOT NULL CONSTRAINT PK_EntregaSapHistorial PRIMARY KEY,
    docEntry int NOT NULL CONSTRAINT UQ_EntregaSapHistorial_entry UNIQUE,
    fechaEntrega datetime2(3) NOT NULL,
    estadoLogistico varchar(30) NOT NULL,
    estadoFinanciero nvarchar(40) NOT NULL,
    datos nvarchar(max) NOT NULL CONSTRAINT CK_EntregaSapHistorial_json CHECK(ISJSON(datos)=1),
    detectadoEn datetime2(3) NOT NULL CONSTRAINT DF_EntregaSapHistorial_fecha DEFAULT SYSUTCDATETIME(),
    revisadoEn datetime2(3) NOT NULL CONSTRAINT DF_EntregaSapHistorial_revision DEFAULT SYSUTCDATETIME()
  );
  CREATE INDEX IX_EntregaSapHistorial_fecha ON dbo.EntregaSapHistorial(fechaEntrega DESC, docEntry);
  CREATE TABLE dbo.EntregaSapHistorialLinea (
    idOrigen varchar(100) NOT NULL REFERENCES dbo.EntregaSapHistorial(idOrigen),
    lineNum int NOT NULL,
    whsCode nvarchar(16) NOT NULL,
    baseType int NOT NULL,
    baseEntry int NULL,
    baseLine int NULL,
    invQty decimal(19,6) NOT NULL,
    cantidadEntregada decimal(19,6) NOT NULL,
    datos nvarchar(max) NOT NULL CONSTRAINT CK_EntregaSapHistorialLinea_json CHECK(ISJSON(datos)=1),
    CONSTRAINT PK_EntregaSapHistorialLinea PRIMARY KEY(idOrigen, lineNum)
  );
  CREATE INDEX IX_EntregaSapHistorialLinea_almacen ON dbo.EntregaSapHistorialLinea(whsCode, idOrigen);
  CREATE INDEX IX_EntregaSapHistorialLinea_base ON dbo.EntregaSapHistorialLinea(baseType, baseEntry, baseLine);
END;
IF OBJECT_ID(N'dbo.ControlEntregasSap', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.ControlEntregasSap (
    clave int NOT NULL CONSTRAINT PK_ControlEntregasSap PRIMARY KEY CHECK(clave=1),
    ultimoDocEntry int NOT NULL, anteriorDocEntry int NOT NULL, revisionDocEntry int NOT NULL,
    ultimaFacturaDocEntry int NOT NULL CONSTRAINT DF_ControlEntregasSap_factura DEFAULT 0
  );
  INSERT dbo.ControlEntregasSap VALUES(1,0,0,0,0);
END;
IF COL_LENGTH('dbo.ControlEntregasSap','ultimaFacturaDocEntry') IS NULL
  ALTER TABLE dbo.ControlEntregasSap ADD ultimaFacturaDocEntry int NOT NULL DEFAULT 0;
IF OBJECT_ID(N'dbo.EntregaSapHistorialCambio',N'U') IS NULL
BEGIN
  CREATE TABLE dbo.EntregaSapHistorialCambio (
    idCambio bigint IDENTITY CONSTRAINT PK_EntregaSapHistorialCambio PRIMARY KEY,
    idOrigen varchar(100) NOT NULL REFERENCES dbo.EntregaSapHistorial(idOrigen),
    estadoLogistico varchar(30) NOT NULL,
    estadoFinanciero nvarchar(40) NOT NULL,
    facturas nvarchar(max) NOT NULL,
    detectadoEn datetime2(3) NOT NULL CONSTRAINT DF_EntregaSapHistorialCambio_fecha DEFAULT SYSUTCDATETIME()
  );
  CREATE INDEX IX_EntregaSapHistorialCambio_entrega ON dbo.EntregaSapHistorialCambio(idOrigen,idCambio);
END;
IF NOT EXISTS(SELECT 1 FROM dbo.MigracionEsquema WHERE versionMigracion=14)
  INSERT dbo.MigracionEsquema(versionMigracion,nombre) VALUES(14,N'historial independiente de entregas SAP');
`;
