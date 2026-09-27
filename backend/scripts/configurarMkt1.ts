import 'dotenv/config';
import {
  cerrarConexionPedidosBodega, inicializarConexionPedidosBodega, obtenerPoolPedidosBodega,
} from '../src/infraestructura/sql/conexionPedidosBodega.js';

// La restricción a dashboards se aplica en el middleware y en la navegación.
await inicializarConexionPedidosBodega();
try {
  const resultado = await obtenerPoolPedidosBodega().request().query(`
    SET XACT_ABORT ON;
    BEGIN TRANSACTION;
    IF DB_NAME() <> N'PedidosBodega' THROW 51000, 'Base no autorizada.', 1;
    DECLARE @rol uniqueidentifier = (
      SELECT idRol FROM dbo.RolAplicacion WHERE codigo=N'DASHBOARDS' AND activo=1
    );
    IF @rol IS NULL THROW 51000, 'No existe el rol DASHBOARDS activo.', 1;
    UPDATE dbo.UsuarioAplicacion
      SET rolId=@rol, codigoRol=N'DASHBOARDS', actualizadoEn=SYSUTCDATETIME()
      WHERE nombreUsuario=N'mkt1';
    IF @@ROWCOUNT <> 1 THROW 51000, 'No se encontró una única cuenta mkt1.', 1;
    UPDATE s SET revocadaEn=SYSUTCDATETIME()
      FROM dbo.SesionAutenticada s
      JOIN dbo.UsuarioAplicacion u ON u.idUsuario=s.idUsuario
      WHERE u.nombreUsuario=N'mkt1' AND s.revocadaEn IS NULL;
    SELECT u.nombreUsuario, r.codigo AS codigoRol, u.activo
      FROM dbo.UsuarioAplicacion u JOIN dbo.RolAplicacion r ON r.idRol=u.rolId
      WHERE u.nombreUsuario=N'mkt1';
    COMMIT TRANSACTION;
  `);
  console.info(resultado.recordset);
} finally {
  await cerrarConexionPedidosBodega();
}
