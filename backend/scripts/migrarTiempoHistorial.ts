import 'dotenv/config';
import {
  cerrarConexionPedidosBodega,
  inicializarConexionPedidosBodega,
  obtenerPoolPedidosBodega,
} from '../src/infraestructura/sql/conexionPedidosBodega.js';
import { MIGRACION_TIEMPO_HISTORIAL } from '../src/modulos/historial/tiempoHistorialMigracion.js';

await inicializarConexionPedidosBodega();
try {
  await obtenerPoolPedidosBodega().request().query(MIGRACION_TIEMPO_HISTORIAL);
  console.info('Migracion 19 aplicada en PedidosBodega.');
} finally {
  await cerrarConexionPedidosBodega();
}
