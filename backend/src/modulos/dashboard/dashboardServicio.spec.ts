import { describe, expect, it, vi } from 'vitest';
import { DashboardServicio } from './dashboardServicio.js';
import type { IDashboardRepositorio } from './dashboardRepositorio.js';

describe('DashboardServicio', () => {
  it('suma pedidos por tienda sin contar líneas', async () => {
    const repositorio: IDashboardRepositorio = {
      obtenerResumen: vi.fn().mockResolvedValue([
        { codigoTienda: 'SPS', nombreTienda: 'San Pedro Sula_P', pendientes: 2, validados: 4, disponible: true },
        { codigoTienda: 'TGU', nombreTienda: 'Tegucigalpa', pendientes: 3, validados: 1, disponible: true },
      ]),
      obtenerTiendas: vi.fn().mockResolvedValue([]),
    };
    const resultado = await new DashboardServicio(repositorio).obtener({
      fechaDesde: '2026-08-05', fechaHasta: '2026-08-05',
    });
    expect(resultado.totales).toEqual({ pendientes: 5, validados: 5 });
    expect(resultado.porTienda).toHaveLength(2);
  });

  it('conserva cero totales cuando no hay actividad', async () => {
    const repositorio: IDashboardRepositorio = {
      obtenerResumen: vi.fn().mockResolvedValue([]),
      obtenerTiendas: vi.fn().mockResolvedValue([{ codigoTienda: 'SPS', nombreTienda: 'San Pedro Sula_P' }]),
    };
    const resultado = await new DashboardServicio(repositorio).obtener({
      fechaDesde: '2026-08-05', fechaHasta: '2026-08-05', codigoTienda: 'SPS',
    });
    expect(resultado.totales).toEqual({ pendientes: 0, validados: 0 });
    expect(resultado.tiendas).toHaveLength(1);
  });
});
