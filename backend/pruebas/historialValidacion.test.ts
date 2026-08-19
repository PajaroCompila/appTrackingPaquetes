import { describe, expect, it } from 'vitest';
import { esquemaFiltrosHistorial } from '../src/modulos/historial/historialValidacion.js';

describe('validación del historial', () => {
  it('acepta rangos históricos de hasta 366 días con paginación limitada', () => {
    const resultado = esquemaFiltrosHistorial.parse({
      fechaDesde: '2026-07-01', fechaHasta: '2026-07-30', cantidadPorPagina: '100',
      numeroPedido: '0012345', codigoAlmacen: [' BSPS01 ', 'BTGU01', 'BSPS01'],
    });
    expect(resultado).toMatchObject({ pagina: 1, cantidadPorPagina: 100,
      numeroPedido: '0012345', codigosAlmacen: ['BSPS01', 'BTGU01'] });
  });

  it('rechaza rangos extensos y páginas sin límite', () => {
    expect(esquemaFiltrosHistorial.safeParse({
      fechaDesde: '2024-01-01', fechaHasta: '2026-07-30',
    }).success).toBe(false);
    expect(esquemaFiltrosHistorial.safeParse({
      fechaDesde: '2026-07-01', fechaHasta: '2026-07-30', cantidadPorPagina: '101',
    }).success).toBe(false);
  });

  it('rechaza el filtro anterior por sucursal y valores no válidos', () => {
    const fechas = { fechaDesde: '2026-07-01', fechaHasta: '2026-07-30' };
    expect(esquemaFiltrosHistorial.safeParse({ ...fechas, codigoSucursal: 'SPS' }).success).toBe(false);
    expect(esquemaFiltrosHistorial.safeParse({ ...fechas, numeroPedido: 'ABC' }).success).toBe(false);
    expect(esquemaFiltrosHistorial.safeParse({ ...fechas, codigoAlmacen: 'BOD 01' }).success).toBe(false);
    expect(esquemaFiltrosHistorial.safeParse({ ...fechas,
      codigoAlmacen: Array.from({ length: 51 }, (_, indice) => `B${indice}`) }).success).toBe(false);
  });
});
