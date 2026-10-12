import 'dotenv/config';
import { cerrarConexionPedidosBodega, inicializarConexionPedidosBodega,
  obtenerPoolPedidosBodega } from '../src/infraestructura/sql/conexionPedidosBodega.js';
import { MIGRACION_HISTORIAL_R1_SNAPSHOT } from '../src/modulos/historial/historialR1SnapshotMigracion.js';

await inicializarConexionPedidosBodega();
try {
  await obtenerPoolPedidosBodega().request().query(MIGRACION_HISTORIAL_R1_SNAPSHOT);
  console.info('Proyección local de Historial R1 disponible.');
} finally {
  await cerrarConexionPedidosBodega();
}
