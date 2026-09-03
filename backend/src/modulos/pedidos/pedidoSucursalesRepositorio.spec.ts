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
});
