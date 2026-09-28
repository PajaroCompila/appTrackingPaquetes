import 'dotenv/config';
import {
  cerrarConexionPedidosBodega, inicializarConexionPedidosBodega, obtenerPoolPedidosBodega,
} from '../src/infraestructura/sql/conexionPedidosBodega.js';

await inicializarConexionPedidosBodega();
try {
  await obtenerPoolPedidosBodega().request().query(`
    SET XACT_ABORT ON;
    BEGIN TRANSACTION;
    IF DB_NAME() <> N'PedidosBodega' THROW 51000, 'Base no autorizada.', 1;
    IF NOT EXISTS (SELECT 1 FROM dbo.RolAplicacion WITH (UPDLOCK, HOLDLOCK) WHERE codigo=N'DASHBOARDS')
      INSERT dbo.RolAplicacion(codigo,nombre,descripcion)
      VALUES(N'DASHBOARDS',N'DASHBOARDS',N'Consulta de todas las ventanas excepto configuracion de usuarios.');
    UPDATE dbo.RolAplicacion SET descripcion=N'Consulta de todas las ventanas excepto configuracion de usuarios.' WHERE codigo=N'DASHBOARDS';
    COMMIT TRANSACTION;
  `);
  console.info('Rol DASHBOARDS disponible.');
} finally {
  await cerrarConexionPedidosBodega();
}
