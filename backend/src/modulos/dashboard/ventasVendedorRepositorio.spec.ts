import { describe, expect, it, vi } from 'vitest';
import type { ConfiguracionSucursalR1 } from '../../configuracion/configuracionBaseDatos.js';
import { VentasVendedorRepositorio } from './ventasVendedorRepositorio.js';

const sucursal = { codigoTienda: 'TSPS01', nombreTienda: 'San Pedro Sula Principal',
  servidor: '127.0.0.1', puerto: 1433, baseDatos: 'Retail One', usuario: 'u', contrasena: 'c',
  cifrar: false, confiarCertificado: false, tiempoEsperaConexionMs: 5000,
  tiempoMaximoConsultaMs: 10000, poolMinimo: 0, poolMaximo: 1 } satisfies ConfiguracionSucursalR1;

describe('VentasVendedorRepositorio', () => {
  it('suma pedidos únicos por vendedor y calcula métricas', async () => {
    const consultar = vi.fn().mockResolvedValue([
      { codigoVendedor: 10, nombreVendedor: 'Vendedor Uno', ventasValidadas: 7 },
      { codigoVendedor: 20, nombreVendedor: 'Vendedor Dos', ventasValidadas: 3 },
    ]);
    const resultado = await new VentasVendedorRepositorio([sucursal], consultar).obtener({
      codigoSucursal: 'SPS', fechaDesde: '2026-08-06', fechaHasta: '2026-08-06',
    });
    expect(resultado.totales).toEqual({ ventasValidadas: 10, vendedoresConVentas: 2,
      promedioVentasPorVendedor: 5 });
    expect(resultado.codigoSucursal).toBe('SPS');
  });
});
