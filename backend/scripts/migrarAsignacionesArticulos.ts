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
    SET XACT_ABORT ON;
    BEGIN TRANSACTION;

    IF OBJECT_ID(N'dbo.AsignacionArticuloPedido', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.AsignacionArticuloPedido (
        idOrigen nvarchar(150) NOT NULL,
        identificadorDetalle nvarchar(150) NOT NULL,
        usuarioAsignado nvarchar(100) NULL,
        nombreAsignado nvarchar(150) NULL,
        asignadoPor uniqueidentifier NOT NULL,
        creadoEn datetime2(3) NOT NULL
          CONSTRAINT DF_AsignacionArticuloPedido_creado DEFAULT SYSUTCDATETIME(),
        actualizadoEn datetime2(3) NOT NULL
          CONSTRAINT DF_AsignacionArticuloPedido_actualizado DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_AsignacionArticuloPedido PRIMARY KEY(idOrigen, identificadorDetalle),
        CONSTRAINT FK_AsignacionArticuloPedido_usuario FOREIGN KEY(asignadoPor)
          REFERENCES dbo.UsuarioAplicacion(idUsuario)
      );
      CREATE INDEX IX_AsignacionArticuloPedido_usuario
        ON dbo.AsignacionArticuloPedido(usuarioAsignado, actualizadoEn DESC);
    END;

    IF USER_ID(N'pedidos_bodega_app') IS NOT NULL
      GRANT SELECT, INSERT, UPDATE ON dbo.AsignacionArticuloPedido TO [pedidos_bodega_app];

    IF NOT EXISTS (SELECT 1 FROM dbo.MigracionEsquema WHERE versionMigracion = 11)
      INSERT dbo.MigracionEsquema(versionMigracion, nombre)
        VALUES(11, N'asignación interna de artículos');

    COMMIT TRANSACTION;
  `);
  const verificacion = await obtenerPoolPedidosBodega().request().query<{
    baseDatos: string;
    tablaCreada: number;
    migracionRegistrada: number;
  }>(`
    SELECT DB_NAME() baseDatos,
      CASE WHEN OBJECT_ID(N'dbo.AsignacionArticuloPedido', N'U') IS NULL THEN 0 ELSE 1 END tablaCreada,
      CASE WHEN EXISTS(
        SELECT 1 FROM dbo.MigracionEsquema WHERE versionMigracion = 11
      ) THEN 1 ELSE 0 END migracionRegistrada;
  `);
  const resultado = verificacion.recordset[0];
  console.info('Migración 11 verificada.', resultado);
} finally {
  await cerrarConexionPedidosBodega();
}
