import 'dotenv/config';
import { inicializarConexionPedidosBodega, obtenerPoolPedidosBodega,
  cerrarConexionPedidosBodega } from '../src/infraestructura/sql/conexionPedidosBodega.js';
import { MIGRACION_CONTROL_OPERATIVO } from '../src/modulos/facturadosPendientes/controlOperativoMigracion.js';

await inicializarConexionPedidosBodega();
try {
  await obtenerPoolPedidosBodega().request().query(MIGRACION_CONTROL_OPERATIVO);
  console.info('Migración 18 aplicada únicamente en PedidosBodega. Bodegas B: MANUAL; bodegas T: SIN_VALIDACION_MANUAL.');
} finally { await cerrarConexionPedidosBodega(); }
