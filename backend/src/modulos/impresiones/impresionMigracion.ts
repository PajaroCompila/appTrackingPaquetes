export const MIGRACION_AUDITORIA_IMPRESIONES = `
IF DB_NAME() <> N'PedidosBodega' THROW 51000, 'Base no autorizada.', 1;
IF OBJECT_ID(N'dbo.ImpresionArticulo', N'U') IS NULL
  THROW 51000, 'Aplicar primero la migración 10 de impresiones.', 1;
SET XACT_ABORT ON;
BEGIN TRANSACTION;
BEGIN TRY
  IF OBJECT_ID(N'dbo.RegistroImpresionArticulo', N'U') IS NULL
  BEGIN
    CREATE TABLE dbo.RegistroImpresionArticulo (
      idRegistro bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_RegistroImpresionArticulo PRIMARY KEY,
      idOrigen nvarchar(150) NOT NULL,
      identificadorDetalle nvarchar(150) NOT NULL,
      codigoArticulo nvarchar(100) NULL,
      usuarioId uniqueidentifier NOT NULL,
      impresoEn datetime2(3) NOT NULL,
      creadoEn datetime2(3) NOT NULL CONSTRAINT DF_RegistroImpresionArticulo_creado DEFAULT SYSUTCDATETIME(),
      CONSTRAINT FK_RegistroImpresionArticulo_usuario FOREIGN KEY(usuarioId)
        REFERENCES dbo.UsuarioAplicacion(idUsuario),
      CONSTRAINT FK_RegistroImpresionArticulo_linea FOREIGN KEY(idOrigen, identificadorDetalle)
        REFERENCES dbo.ImpresionArticulo(idOrigen, identificadorDetalle)
    );
    CREATE INDEX IX_RegistroImpresionArticulo_linea
      ON dbo.RegistroImpresionArticulo(idOrigen, identificadorDetalle, impresoEn DESC, idRegistro DESC);
  END;
  IF USER_ID(N'pedidos_bodega_app') IS NOT NULL
    GRANT SELECT, INSERT ON dbo.RegistroImpresionArticulo TO [pedidos_bodega_app];
  IF NOT EXISTS(SELECT 1 FROM dbo.MigracionEsquema WHERE versionMigracion=17)
    INSERT dbo.MigracionEsquema(versionMigracion, nombre)
      VALUES(17, N'auditoría de confirmaciones de impresión por artículo');
  COMMIT TRANSACTION;
END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
  THROW;
END CATCH;
`;
