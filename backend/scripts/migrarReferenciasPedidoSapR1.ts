import 'dotenv/config';
import { cerrarConexionPedidosBodega, inicializarConexionPedidosBodega,
  obtenerPoolPedidosBodega } from '../src/infraestructura/sql/conexionPedidosBodega.js';
import { MIGRACION_REFERENCIA_PEDIDO_SAP_R1 } from '../src/modulos/historial/referenciaPedidoSapR1Migracion.js';

await inicializarConexionPedidosBodega();
try {
  await obtenerPoolPedidosBodega().request().query(MIGRACION_REFERENCIA_PEDIDO_SAP_R1);
  console.info('Referencias SAP/R1 disponibles en la base local.');
} finally {
  await cerrarConexionPedidosBodega();
}
