import 'dotenv/config';
import {
  cerrarConexionPedidosBodega,
  inicializarConexionPedidosBodega,
  obtenerPoolPedidosBodega,
} from '../src/infraestructura/sql/conexionPedidosBodega.js';
import { MIGRACION_AUDITORIA_IMPRESIONES } from '../src/modulos/impresiones/impresionMigracion.js';

await inicializarConexionPedidosBodega();
try {
  await obtenerPoolPedidosBodega().request().query(MIGRACION_AUDITORIA_IMPRESIONES);
  console.info('Migración 17 aplicada únicamente en PedidosBodega.');
} finally {
  await cerrarConexionPedidosBodega();
}
