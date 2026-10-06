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
    IF NOT EXISTS (SELECT 1 FROM dbo.RolAplicacion WITH (UPDLOCK, HOLDLOCK) WHERE codigo=N'INVENTARIO')
      INSERT dbo.RolAplicacion(codigo,nombre,descripcion)
      VALUES(N'INVENTARIO',N'Inventario',N'Consulta exclusiva del inventario de artículos.');
    UPDATE dbo.RolAplicacion
      SET nombre=N'Inventario', descripcion=N'Consulta exclusiva del inventario de artículos.', activo=1
      WHERE codigo=N'INVENTARIO';
    COMMIT TRANSACTION;
  `);
  console.info('Rol INVENTARIO disponible.');
} finally {
  await cerrarConexionPedidosBodega();
}
