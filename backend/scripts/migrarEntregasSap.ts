import 'dotenv/config';
import { inicializarConexionPedidosBodega, obtenerPoolPedidosBodega, cerrarConexionPedidosBodega } from '../src/infraestructura/sql/conexionPedidosBodega.js';
import { MIGRACION_ENTREGAS_SAP } from '../src/modulos/historial/entregaSapMigracion.js';
import { MIGRACION_CONCILIACION_ENTREGAS } from '../src/modulos/pedidos/conciliacionEntregaMigracion.js';

await inicializarConexionPedidosBodega();
try {
  await obtenerPoolPedidosBodega().request().query(MIGRACION_ENTREGAS_SAP);
  await obtenerPoolPedidosBodega().request().query(MIGRACION_CONCILIACION_ENTREGAS);
  console.info('Historial de entregas SAP preparado únicamente en PedidosBodega.');
} finally { await cerrarConexionPedidosBodega(); }
