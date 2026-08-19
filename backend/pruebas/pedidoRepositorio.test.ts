import type sql from 'mssql';
import { describe, expect, it, vi } from 'vitest';
import { PedidoRepositorio } from '../src/modulos/pedidos/pedidoRepositorio.js';

describe('PedidoRepositorio', () => {
  it('parametriza filtros, evita duplicados y limita la página', async () => {
    const parametros = new Map<string, unknown>();
    const consultas: string[] = [];
    let numeroConsulta = 0;
    const filas = Array.from({ length: 26 }, (_, indice) => ({
      folioPedido: `F${indice}`,
      numeroPedido: String(1000 + indice),
      codigoVenta: `V${indice}`,
      codigoVendedor: 30,
      nombreVendedor: 'Vendedor original',
      codigosAlmacen: 'BSPS01',
      nombresBodega: 'Bodega Principal SPS',
      fechaHoraPedido: '2026-07-30T12:55:00',
      codigoEstadoVenta: 'A',
      codigoSincronizacion: 'N',
      totalRegistros: 26,
    }));
    const solicitud = {
      input: vi.fn((nombre: string, _tipo: unknown, valor: unknown) => {
        parametros.set(nombre, valor);
        return solicitud;
      }),
      query: vi.fn(async (consulta: string) => {
        consultas.push(consulta);
        numeroConsulta += 1;
        return numeroConsulta === 1 ? { recordset: filas } : {
          recordset: filas.slice(0, 25).map((fila) => ({
            folioPedido: fila.folioPedido,
            numeroPartida: 1,
            codigoArticulo: `00${fila.folioPedido}`,
            descripcion: `Artículo ${fila.folioPedido}`,
            cantidad: 1,
            codigoAlmacen: 'BSPS01',
            nombreAlmacen: 'Bodega Principal SPS',
          })),
        };
      }),
    };
    const pool = { request: () => solicitud } as unknown as sql.ConnectionPool;
    const repositorio = new PedidoRepositorio(() => pool);

    const resultado = await repositorio.buscarPedidos({
      numeroPedido: '101468453',
      codigosAlmacen: ['BSPS01', 'BSPS02'],
      pagina: 1,
      cantidadPorPagina: 25,
    });

    expect(resultado.pedidos).toHaveLength(25);
    expect(resultado.hayMas).toBe(true);
    expect(parametros.get('codigoAlmacen0')).toBe('BSPS01');
    expect(parametros.get('codigoAlmacen1')).toBe('BSPS02');
    expect(parametros.get('numeroPedido')).toBe('101468453');
    expect(parametros.get('cantidadConsulta')).toBe(26);
    expect(consultas[0]).toContain('EXISTS');
    expect(consultas[0]).toContain('IN (@codigoAlmacen0, @codigoAlmacen1)');
    expect(consultas[0]).toContain('COUNT_BIG(*) OVER() AS totalRegistros');
    expect(consultas[0]).toContain('vendedor.[SlpCode] = venta.[U_SO1_VENDEDOR]');
    expect(consultas[0]).toContain('venta.[U_SO1_HORA]');
    expect(consultas[0]).toContain("ISNULL(venta.[U_SO1_VERIFICADO], 'N') <> 'Y'");
    expect(consultas[0]).toContain("venta.[U_SO1_TIPO] = 'PE'");
    expect(consultas[0]).toContain("venta.[U_SO1_STATUS] = 'A'");
    expect(consultas[0]).toContain("NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(20), venta.[U_SO1_DOCUMENTOSBO]))), '') IS NOT NULL");
    expect(consultas[0].indexOf('NULLIF(LTRIM')).toBeLessThan(consultas[0].indexOf('OFFSET @desplazamiento'));
    expect(consultas[0]).toContain('OFFSET @desplazamiento');
    expect(consultas[0]).toContain('venta.[Name] DESC');
    expect(consultas[1]).toContain('[@SO1_01SUCURSALALMA]');
    expect(consultas[1]).toContain('detalle.[U_SO1_NUMEROARTICULO] AS codigoArticulo');
    expect(consultas[1]).toContain('detalle.[U_SO1_NUMPARTIDA] AS numeroPartida');
    expect(consultas[1]).toContain('detalle.[U_SO1_ALMACEN] IN (@codigoAlmacen0, @codigoAlmacen1)');
    expect(consultas.every((consulta) => !/SELECT\s+\*/i.test(consulta))).toBe(true);
    expect(resultado.pedidos[0]?.articulos).toEqual([expect.objectContaining({
      identificadorDetalle: '1', codigoArticulo: '00F0', descripcion: 'Artículo F0', cantidad: 1, codigoAlmacen: 'BSPS01',
    })]);
    expect(resultado.totalRegistros).toBe(26);
    expect(resultado.pedidos.every((pedido) => pedido.articulos.length === 1)).toBe(true);
  });

  it('consulta cabecera y partidas por el mismo folio parametrizado', async () => {
    const consultas: string[] = [];
    const valoresFolio: unknown[] = [];
    let numeroConsulta = 0;
    const pool = {
      request: () => {
        const solicitud = {
          input: vi.fn((nombre: string, _tipo: unknown, valor: unknown) => {
            if (nombre === 'folioPedido') valoresFolio.push(valor);
            return solicitud;
          }),
          query: vi.fn(async (consulta: string) => {
            consultas.push(consulta);
            numeroConsulta += 1;
            return numeroConsulta === 1
              ? {
                  recordset: [{
                    folioPedido: 'F1', numeroPedido: '101468453', codigoVenta: 'V1',
                    codigoVendedor: 30, nombreVendedor: 'Vendedor original',
                    codigosAlmacen: 'BSPS01', nombresBodega: 'Bodega Principal SPS',
                    fechaHoraPedido: '2026-07-30T12:55:00',
                    codigoEstadoVenta: 'A', codigoSincronizacion: 'N',
                  }],
                }
              : {
                  recordset: [{
                    numeroPartida: 1, codigoArticulo: 'A1', descripcionArticulo: 'Artículo',
                    cantidadSolicitada: 2, codigoAlmacen: 'BSPS01',
                    nombreAlmacen: 'Bodega', codigoEstadoEntrega: 'A',
                  }],
                };
          }),
        };
        return solicitud;
      },
    } as unknown as sql.ConnectionPool;
    const repositorio = new PedidoRepositorio(() => pool);

    const resultado = await repositorio.obtenerDetallePedido('F1', ['BSPS01']);

    expect(resultado?.partidas[0]?.numeroPartida).toBe('1');
    expect(resultado?.cabecera.numeroPedido).toBe('101468453');
    expect(valoresFolio).toEqual(['F1', 'F1']);
    expect(consultas[1]).toContain('LEFT JOIN [dbo].[@SO1_01SUCURSALALMA]');
    expect(consultas[1]).toContain('detalle.[U_SO1_ALMACEN] IN (@codigoAlmacen0)');
    expect(consultas[1]).toContain('ORDER BY detalle.[U_SO1_NUMPARTIDA]');
  });
});
