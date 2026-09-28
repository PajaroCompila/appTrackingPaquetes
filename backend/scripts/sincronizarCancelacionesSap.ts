import 'dotenv/config';
import { inicializarConexionPedidosBodega, cerrarConexionPedidosBodega, obtenerPoolPedidosBodega } from '../src/infraestructura/sql/conexionPedidosBodega.js';
import { cerrarConexionSap } from '../src/infraestructura/sql/conexionSap.js';
import { cancelacionesSap } from '../src/modulos/pedidosDevueltos/cancelacionSapHistorial.js';
await inicializarConexionPedidosBodega();
try {
  await cancelacionesSap.sincronizar();
  const r = await obtenerPoolPedidosBodega().request().query(`SELECT canceled,COUNT(*) cantidad FROM dbo.CancelacionSapHistorial GROUP BY canceled;
    SELECT numeroPedido,folioPedido,fechaPedido,canceled FROM dbo.CancelacionSapHistorial
    WHERE fechaPedido IN('20260902','20260910') ORDER BY fechaPedido,numeroPedido;`);
  console.info(JSON.stringify(r.recordsets));
} finally { await cerrarConexionSap(); await cerrarConexionPedidosBodega(); }
