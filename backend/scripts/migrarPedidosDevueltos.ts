import 'dotenv/config';
import { inicializarConexionPedidosBodega, obtenerPoolPedidosBodega, cerrarConexionPedidosBodega } from '../src/infraestructura/sql/conexionPedidosBodega.js';
import { MIGRACION_DEVOLUCIONES } from '../src/modulos/pedidosDevueltos/pedidoDevueltoMigracion.js';

await inicializarConexionPedidosBodega();
try {
  await obtenerPoolPedidosBodega().request().query(MIGRACION_DEVOLUCIONES);
  console.info('Pedidos devueltos preparado únicamente en PedidosBodega.');
} finally { await cerrarConexionPedidosBodega(); }
