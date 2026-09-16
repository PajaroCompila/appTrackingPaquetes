export const MIGRACION_DEVOLUCIONES = `
IF DB_NAME() <> N'PedidosBodega' THROW 51000, 'Base no autorizada.', 1;
IF OBJECT_ID(N'dbo.DevolucionPedido',N'U') IS NULL
BEGIN
  CREATE TABLE dbo.DevolucionPedido (
    idClave varchar(64) NOT NULL PRIMARY KEY,
    idPedidoDespachado bigint NOT NULL REFERENCES dbo.PedidoDespachado(idPedidoDespachado),
    evento nvarchar(150) NOT NULL,
    idOrigen nvarchar(150) NOT NULL,
    origenPedido varchar(3) NOT NULL,
    folioPedido nvarchar(100) NULL,
    numeroPedido nvarchar(100) NOT NULL,
    nombreVendedor nvarchar(200) NULL,
    fechaDespacho datetime2(3) NOT NULL,
    fechaCancelacion datetime2(3) NOT NULL,
    motivo nvarchar(100) NOT NULL,
    canceladoPor nvarchar(200) NULL,
    evidencia nvarchar(max) NOT NULL CHECK(ISJSON(evidencia)=1),
    estado nvarchar(40) NOT NULL DEFAULT N'PENDIENTE DE DEVOLUCIÓN',
    totalLineas int NOT NULL,
    lineasRecibidas int NOT NULL DEFAULT 0,
    fechaDevolucionCompleta datetime2(3) NULL,
    detectadoEn datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
    UNIQUE(idPedidoDespachado,evento)
  );
  CREATE INDEX IX_DevolucionPedido_fecha ON dbo.DevolucionPedido(fechaCancelacion DESC,idClave);
  CREATE INDEX IX_DevolucionPedido_origen ON dbo.DevolucionPedido(idOrigen);
  CREATE TABLE dbo.DevolucionPedidoDetalle (
    idClave varchar(64) NOT NULL REFERENCES dbo.DevolucionPedido(idClave),
    idDetalleDespachado bigint NOT NULL REFERENCES dbo.PedidoDespachadoDetalle(idDetalle),
    identificadorDetalle nvarchar(150) NOT NULL,
    codigoArticulo nvarchar(100) NULL,
    descripcion nvarchar(500) NULL,
    cantidad decimal(19,6) NOT NULL CHECK(cantidad>0),
    codigoAlmacen nvarchar(16) NOT NULL,
    estado nvarchar(40) NOT NULL DEFAULT N'PENDIENTE DE DEVOLUCIÓN',
    cantidadRecibida decimal(19,6) NOT NULL DEFAULT 0,
    recibidoPorUsuarioId uniqueidentifier NULL REFERENCES dbo.UsuarioAplicacion(idUsuario),
    recibidoEn datetime2(3) NULL,
    PRIMARY KEY(idClave,identificadorDetalle),
    UNIQUE(idClave,idDetalleDespachado)
  );
  CREATE INDEX IX_DevolucionPedidoDetalle_almacen ON dbo.DevolucionPedidoDetalle(codigoAlmacen,idClave);
END;
IF OBJECT_ID(N'dbo.ControlDevoluciones',N'U') IS NULL
  CREATE TABLE dbo.ControlDevoluciones(clave int NOT NULL PRIMARY KEY CHECK(clave=1),ultimoId bigint NOT NULL);
IF NOT EXISTS(SELECT 1 FROM dbo.ControlDevoluciones WHERE clave=1)
  INSERT dbo.ControlDevoluciones VALUES(1,0);
IF NOT EXISTS(SELECT 1 FROM dbo.MigracionEsquema WHERE versionMigracion=16)
  INSERT dbo.MigracionEsquema(versionMigracion,nombre) VALUES(16,N'recepción física de pedidos devueltos');
`;
