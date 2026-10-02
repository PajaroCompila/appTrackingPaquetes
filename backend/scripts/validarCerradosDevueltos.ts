import 'dotenv/config';
import assert from 'node:assert/strict';
import { inicializarConexionPedidosBodega, cerrarConexionPedidosBodega } from '../src/infraestructura/sql/conexionPedidosBodega.js';
import { cerrarConexionSap } from '../src/infraestructura/sql/conexionSap.js';
import { CancelacionSapHistorial } from '../src/modulos/pedidosDevueltos/cancelacionSapHistorial.js';
import { consultarSap } from '../src/infraestructura/sql/consultaSap.js';

const cancelacionesSap = new CancelacionSapHistorial(async <T>(consulta: string) => {
  const inicio = Date.now();
  console.info('Consultando SAP:', consulta.includes('NOT EXISTS') ? 'cierres' : 'cancelaciones');
  const resultado = await consultarSap<T>(consulta);
  console.info('Filas:', resultado.recordset.length, 'Duración ms:', Date.now() - inicio);
  return resultado;
});

// Sincroniza exclusivamente la caché local. SAP se consulta en modo lectura.
await inicializarConexionPedidosBodega();
try {
  await cancelacionesSap.sincronizar();
  for (const numeroPedido of ['101477689', '101477682']) {
    const filtros = { numeroPedido, codigosAlmacen: [], estado: 'todos' as const,
      vista: 'pedido' as const, pagina: 1, cantidadPorPagina: 25 };
    const pedidos = await cancelacionesSap.listar(filtros);
    assert.equal(pedidos.total, 1);
    const pedido = pedidos.datos[0]!;
    assert.equal(pedido.estado, 'CERRADO');
    const articulos = await cancelacionesSap.listar({ ...filtros, vista: 'articulos' });
    assert.ok(articulos.total > 0);
    assert.equal((await cancelacionesSap.obtener(pedido.idClave))?.estado, 'CERRADO');
    console.info(JSON.stringify({ numeroPedido, estado: pedido.estado, articulos: articulos.total,
      fechaPedido: pedido.fechaHoraPedido, vistas: ['Pedido', 'Artículos', 'Detalle'] }));
  }
} finally {
  await cerrarConexionSap();
  await cerrarConexionPedidosBodega();
}
