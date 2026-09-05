import type sql from 'mssql';
import { describe, expect, it, vi } from 'vitest';
import { DespachoRepositorio } from '../src/modulos/despachos/despachoRepositorio.js';

describe('DespachoRepositorio', () => {
  it('aplica el filtro de almacén en cabeceras, detalles y datos devueltos', async () => {
    const parametros = new Map<string, unknown>();
    let consulta = '';
    const fechaPedido = new Date('2026-08-03T10:00:00Z');
    const fechaDespacho = new Date('2026-08-03T12:00:00Z');
    const solicitud = {
      input: vi.fn((nombre: string, _tipo: unknown, valor: unknown) => {
        parametros.set(nombre, valor);
        return solicitud;
      }),
      query: vi.fn(async (texto: string) => {
        consulta = texto;
        return {
          recordset: [{
            idOrigen: 'R1:F1',
            origenPedido: 'R1',
            creadoEnR1: true,
            sapDocEntry: null,
            folioPedido: 'F1',
            numeroPedido: '100',
            nombreVendedor: 'Vendedor',
            fechaHoraPedido: fechaPedido,
            despachadoEn: fechaDespacho,
            usuarioDespacho: 'Sistemas',
            total: 1,
            identificadorDetalle: '1',
            numeroLinea: 1,
            codigoArticulo: 'A1',
            descripcion: 'Artículo uno',
            cantidad: 2,
            detalleCodigoAlmacen: 'BSPS01',
            detalleNombreAlmacen: 'Bodega 1',
            transferidoEn: fechaDespacho,
            usuarioLinea: 'Operador',
          }],
        };
      }),
    };
    const pool = { request: () => solicitud } as unknown as sql.ConnectionPool;
    const repositorio = new DespachoRepositorio(() => pool);

    const resultado = await repositorio.listar({
      fechaDesde: '2026-08-03',
      fechaHasta: '2026-08-03',
      codigosAlmacen: ['BSPS01'],
      pagina: 1,
      cantidadPorPagina: 25,
    });

    expect(parametros.get('codigoAlmacen0')).toBe('BSPS01');
    expect(consulta).toContain('EXISTS');
    expect(consulta).toContain('filtro.codigoAlmacen IN (@codigoAlmacen0)');
    expect(consulta).toMatch(/JOIN dbo\.PedidoDespachadoDetalle detalle\s+ON detalle\.idPedidoDespachado = pedido\.idPedidoDespachado\s+AND detalle\.codigoAlmacen IN \(@codigoAlmacen0\)/);
    expect(resultado.pedidos[0]?.codigosAlmacen).toEqual(['BSPS01']);
    expect(resultado.pedidos[0]?.nombresBodega).toBe('Bodega 1');
    expect(resultado.pedidos[0]?.articulos.every((articulo) => articulo.codigoAlmacen === 'BSPS01')).toBe(true);
  });
});
