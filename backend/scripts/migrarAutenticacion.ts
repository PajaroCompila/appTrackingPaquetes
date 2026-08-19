import 'dotenv/config';
import { cerrarConexionPedidosBodega, inicializarConexionPedidosBodega, obtenerPoolPedidosBodega } from '../src/infraestructura/sql/conexionPedidosBodega.js';
import { baseAplicacionAutorizada } from '../src/configuracion/configuracionBaseDatos.js';

await inicializarConexionPedidosBodega();
try {
  const pool = obtenerPoolPedidosBodega();
  const base = await pool.request().query<{ baseActual: string }>('SELECT DB_NAME() AS baseActual;');
  if (base.recordset[0]?.baseActual !== baseAplicacionAutorizada) {
    throw new Error('La migraciÃ³n de autenticaciÃ³n solo puede ejecutarse en PedidosBodega.');
  }
  await pool.request().query(`
    SET XACT_ABORT ON;
    BEGIN TRANSACTION;
    IF COL_LENGTH(N'dbo.UsuarioAplicacion', N'nombreVisible') IS NULL
    BEGIN
      ALTER TABLE dbo.UsuarioAplicacion ADD nombreVisible nvarchar(150) NULL;
      EXEC(N'UPDATE dbo.UsuarioAplicacion SET nombreVisible = nombreUsuario WHERE nombreVisible IS NULL;');
      EXEC(N'ALTER TABLE dbo.UsuarioAplicacion ALTER COLUMN nombreVisible nvarchar(150) NOT NULL;');
    END;
    IF OBJECT_ID(N'dbo.SesionAutenticada', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.SesionAutenticada (
        idSesion uniqueidentifier NOT NULL CONSTRAINT PK_SesionAutenticada PRIMARY KEY,
        idUsuario uniqueidentifier NOT NULL,
        creadaEn datetime2(3) NOT NULL CONSTRAINT DF_SesionAutenticada_creadaEn DEFAULT SYSUTCDATETIME(),
        expiraEn datetime2(3) NOT NULL,
        revocadaEn datetime2(3) NULL,
        CONSTRAINT FK_SesionAutenticada_usuario FOREIGN KEY (idUsuario)
          REFERENCES dbo.UsuarioAplicacion(idUsuario)
      );
      CREATE INDEX IX_SesionAutenticada_usuario_vigencia
        ON dbo.SesionAutenticada(idUsuario, expiraEn) INCLUDE (revocadaEn);
    END;
    IF NOT EXISTS (SELECT 1 FROM dbo.MigracionEsquema WHERE versionMigracion = 2)
      INSERT INTO dbo.MigracionEsquema(versionMigracion, nombre)
      VALUES (2, N'autenticaciÃ³n local y sesiones revocables');
    IF USER_ID(N'pedidos_bodega_app') IS NOT NULL
    BEGIN
      GRANT SELECT, INSERT, UPDATE ON dbo.SesionAutenticada TO [pedidos_bodega_app];
      GRANT SELECT, INSERT, UPDATE ON dbo.UsuarioAplicacion TO [pedidos_bodega_app];
    END;
    COMMIT TRANSACTION;
  `);
  console.info('MigraciÃ³n de autenticaciÃ³n aplicada exclusivamente en PedidosBodega.');
} finally {
  await cerrarConexionPedidosBodega();
}
