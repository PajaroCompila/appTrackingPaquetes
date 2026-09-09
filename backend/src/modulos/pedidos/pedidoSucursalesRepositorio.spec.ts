import { describe, expect, it, vi } from 'vitest';
import type { ConfiguracionSucursalR1 } from '../../configuracion/configuracionBaseDatos.js';
import type { IPedidoRepositorio } from './pedidoRepositorio.js';
import { PedidoSucursalesRepositorio } from './pedidoSucursalesRepositorio.js';

const configuracion = (codigoTienda: string): ConfiguracionSucursalR1 => ({
  codigoTienda, nombreTienda: codigoTienda, servidor: '127.0.0.1', puerto: 1433,
  baseDatos: 'Retail One', usuario: 'u', contrasena: 'c', cifrar: false,
  confiarCertificado: false, tiempoEsperaConexionMs: 5000, tiempoMaximoConsultaMs: 10000,
  poolMinimo: 0, poolMaximo: 1,
});

describe('PedidoSucursalesRepositorio', () => {
  it('combina sucursales, tolera una caída y ordena sin duplicar identidades', async () => {
    const pedido = (idOrigen: string, fechaHoraPedido: string) => ({ idOrigen, origenPedido: 'R1' as const,
      creadoEnR1: true, sapDocEntry: null, folioPedido: idOrigen.split(':').at(-1)!, numeroPedido: idOrigen,
      codigoVenta: null, codigoVendedor: null, nombreVendedor: null, codigosAlmacen: [], nombresBodega: null,
      fechaHoraPedido, codigoEstadoVenta: 'A', codigoSincronizacion: null, articulos: [] });
    const crear = vi.fn(async (sucursal: ConfiguracionSucursalR1): Promise<IPedidoRepositorio> => {
      if (sucursal.codigoTienda === 'TPRO01') throw new Error('No disponible');
      return { buscarPedidos: vi.fn().mockResolvedValue({ pedidos: [pedido(`R1:${sucursal.codigoTienda}:F1`,
        sucursal.codigoTienda === 'TLCB01' ? '2026-08-06T09:00:00' : '2026-08-06T10:00:00')],
      pagina: 1, cantidadPorPagina: 25, totalRegistros: 1, hayMas: false }),
      obtenerDetallePedido: vi.fn() };
    });
    const resultado = await new PedidoSucursalesRepositorio(
      [configuracion('TLCB01'), configuracion('TCIR01'), configuracion('TPRO01')], crear,
    ).buscarPedidos({ pagina: 1, cantidadPorPagina: 25 });
    expect(resultado.totalRegistros).toBe(2);
    expect(resultado.pedidos.map(({ idOrigen }) => idOrigen)).toEqual(['R1:TLCB01:F1', 'R1:TCIR01:F1']);
  });

  it('responde con las sucursales disponibles mientras una consulta lenta continúa en segundo plano', async () => {
    const pedido = (tienda: string) => ({ idOrigen: `R1:${tienda}:F1`, origenPedido: 'R1' as const,
      creadoEnR1: true, sapDocEntry: null, folioPedido: 'F1', numeroPedido: tienda,
      codigoVenta: null, codigoVendedor: null, nombreVendedor: null, codigosAlmacen: [], nombresBodega: null,
      fechaHoraPedido: '2026-09-09T09:00:00', codigoEstadoVenta: 'A', codigoSincronizacion: null, articulos: [] });
    const pagina = (tienda: string) => ({ pedidos: [pedido(tienda)], pagina: 1, cantidadPorPagina: 25,
      totalRegistros: 1, hayMas: false });
    let completarConsultaLenta!: (resultado: ReturnType<typeof pagina>) => void;
    const consultaLenta = new Promise<ReturnType<typeof pagina>>((resolver) => {
      completarConsultaLenta = resolver;
    });
    const repositorioLento = {
      buscarPedidos: vi.fn()
        .mockImplementationOnce(() => consultaLenta)
        .mockResolvedValue(pagina('TPRO01')),
      obtenerDetallePedido: vi.fn(),
    };
    const crear = vi.fn(async (sucursal: ConfiguracionSucursalR1): Promise<IPedidoRepositorio> =>
      sucursal.codigoTienda === 'TPRO01'
        ? repositorioLento
        : { buscarPedidos: vi.fn().mockResolvedValue(pagina('TSPS01')), obtenerDetallePedido: vi.fn() });
    const repositorio = new PedidoSucursalesRepositorio(
      [configuracion('TSPS01'), configuracion('TPRO01')], crear, 10,
    );

    const primeraRespuesta = await repositorio.buscarPedidos({ pagina: 1, cantidadPorPagina: 25 });

    expect(primeraRespuesta.pedidos.map(({ idOrigen }) => idOrigen)).toEqual(['R1:TSPS01:F1']);
    completarConsultaLenta(pagina('TPRO01'));
    await vi.waitFor(() => expect(repositorioLento.buscarPedidos).toHaveBeenCalledTimes(1));
    const segundaRespuesta = await repositorio.buscarPedidos({ pagina: 1, cantidadPorPagina: 25 });
    expect(segundaRespuesta.pedidos.map(({ idOrigen }) => idOrigen)).toEqual([
      'R1:TPRO01:F1', 'R1:TSPS01:F1',
    ]);
  });
});
