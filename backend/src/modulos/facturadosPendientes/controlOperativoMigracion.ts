export const MIGRACION_CONTROL_OPERATIVO = `
IF DB_NAME() <> N'PedidosBodega' THROW 51000, 'Base no autorizada.', 1;
SET XACT_ABORT ON;
BEGIN TRANSACTION;
BEGIN TRY
IF OBJECT_ID(N'dbo.ConfiguracionControlAlmacen',N'U') IS NULL
BEGIN
  CREATE TABLE dbo.ConfiguracionControlAlmacen (
    codigoAlmacen nvarchar(16) NOT NULL PRIMARY KEY,
    modoControl varchar(30) NOT NULL CHECK(modoControl IN ('MANUAL','SIN_VALIDACION_MANUAL')),
    requiereConfirmacionFisica bit NOT NULL,
    activo bit NOT NULL DEFAULT 1,
    creadoEn datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
    actualizadoEn datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT CK_ControlAlmacen_modo CHECK(
      (modoControl='MANUAL' AND requiereConfirmacionFisica=1) OR
      (modoControl='SIN_VALIDACION_MANUAL' AND requiereConfirmacionFisica=0))
  );
END;
-- Política inicial definida por Operaciones el 18/09/2026. Se materializa como
-- configuración editable; la lógica de la aplicación no depende del prefijo.
INSERT dbo.ConfiguracionControlAlmacen(
  codigoAlmacen,modoControl,requiereConfirmacionFisica,activo)
  SELECT DISTINCT detalle.codigoAlmacen,
    CASE WHEN UPPER(LEFT(detalle.codigoAlmacen,1))='B'
      THEN 'MANUAL' ELSE 'SIN_VALIDACION_MANUAL' END,
    CASE WHEN UPPER(LEFT(detalle.codigoAlmacen,1))='B' THEN 1 ELSE 0 END,1
  FROM dbo.SeguimientoPedidoDetalle detalle
  WHERE detalle.codigoAlmacen IS NOT NULL
    AND UPPER(LEFT(detalle.codigoAlmacen,1)) IN ('B','T')
    AND NOT EXISTS(SELECT 1 FROM dbo.ConfiguracionControlAlmacen configuracion
      WHERE configuracion.codigoAlmacen=detalle.codigoAlmacen);
IF OBJECT_ID(N'dbo.ControlOperativoPedido',N'U') IS NULL
BEGIN
  CREATE TABLE dbo.ControlOperativoPedido (
    idOrigen nvarchar(150) NOT NULL PRIMARY KEY REFERENCES dbo.SeguimientoPedido(idOrigen),
    cabecera nvarchar(max) NOT NULL CHECK(ISJSON(cabecera)=1),
    estadoFinanciero nvarchar(40) NULL CHECK(estadoFinanciero IS NULL OR estadoFinanciero=N'Facturado'),
    fuenteFinanciera nvarchar(80) NULL,
    revisadoFinancieroEn datetime2(3) NOT NULL DEFAULT CONVERT(datetime2(3),'19000101'),
    actualizadoEn datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME()
  );
  CREATE INDEX IX_ControlOperativo_revision ON dbo.ControlOperativoPedido(revisadoFinancieroEn,idOrigen);
END;
INSERT dbo.ControlOperativoPedido(idOrigen,cabecera)
  SELECT s.idOrigen,(SELECT COALESCE(d.numeroPedido,h.numeroPedido,
      JSON_VALUE(c.evidencia,'$.numeroPedido'),s.idOrigen) numeroPedido,
    COALESCE(d.nombreVendedor,h.nombreVendedor) nombreVendedor,
    COALESCE(d.fechaHoraPedido,h.fechaHoraPedido,
      TRY_CONVERT(datetime2(3),JSON_VALUE(c.evidencia,'$.fechaPedido'))) fechaHoraPedido
    FOR JSON PATH,WITHOUT_ARRAY_WRAPPER)
  FROM dbo.SeguimientoPedido s LEFT JOIN dbo.PedidoDespachado d ON d.idOrigen=s.idOrigen
  LEFT JOIN dbo.PedidoSapHistorial h ON s.idOrigen=CONCAT('SAP:',h.sapDocEntry)
  OUTER APPLY(SELECT TOP(1) evidencia FROM dbo.ConciliacionEntregaPedido
    WHERE idPedido=s.idOrigen AND activa=1 ORDER BY idEntrega,lineaEntrega) c
  WHERE NOT EXISTS(SELECT 1 FROM dbo.ControlOperativoPedido p WHERE p.idOrigen=s.idOrigen);
IF OBJECT_ID(N'dbo.ConfirmacionFisicaPedido',N'U') IS NULL
BEGIN
  CREATE TABLE dbo.ConfirmacionFisicaPedido (
    idOrigen nvarchar(150) NOT NULL,
    identificadorDetalle nvarchar(150) NOT NULL,
    version char(64) NOT NULL,
    idUsuario uniqueidentifier NOT NULL REFERENCES dbo.UsuarioAplicacion(idUsuario),
    confirmadoEn datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
    PRIMARY KEY(idOrigen,identificadorDetalle,version),
    FOREIGN KEY(idOrigen,identificadorDetalle)
      REFERENCES dbo.SeguimientoPedidoDetalle(idOrigen,identificadorDetalle)
  );
END;
IF USER_ID(N'pedidos_bodega_app') IS NOT NULL
BEGIN
  GRANT SELECT,INSERT,UPDATE ON dbo.ConfiguracionControlAlmacen TO [pedidos_bodega_app];
  GRANT SELECT,INSERT,UPDATE ON dbo.ControlOperativoPedido TO [pedidos_bodega_app];
  GRANT SELECT,INSERT ON dbo.ConfirmacionFisicaPedido TO [pedidos_bodega_app];
END;
IF NOT EXISTS(SELECT 1 FROM dbo.MigracionEsquema WHERE versionMigracion=18)
  INSERT dbo.MigracionEsquema(versionMigracion,nombre) VALUES(18,N'control físico de facturados pendientes');
COMMIT;
END TRY
BEGIN CATCH
  IF @@TRANCOUNT>0 ROLLBACK;
  THROW;
END CATCH;
`;
