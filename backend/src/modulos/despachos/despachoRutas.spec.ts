import { describe, expect, it } from 'vitest';
import { esquemaFiltrosDespachados } from './despachoRutas.js';

describe('esquemaFiltrosDespachados', () => {
  it('normaliza filtros múltiples y conserva paginación', () => {
    expect(esquemaFiltrosDespachados.parse({
      numeroPedido: ' 101469987 ', fechaDesde: '2026-08-15', fechaHasta: '2026-08-19',
      codigoAlmacen: ['BSPS01', 'BSPS02', 'BSPS01'], pagina: '2', cantidadPorPagina: '50',
    })).toEqual({
      numeroPedido: '101469987', fechaDesde: '2026-08-15', fechaHasta: '2026-08-19',
      codigosAlmacen: ['BSPS01', 'BSPS02'], pagina: 2, cantidadPorPagina: 50,
    });
  });

  it('rechaza rangos invertidos y códigos inválidos', () => {
    expect(() => esquemaFiltrosDespachados.parse({
      fechaDesde: '2026-08-20', fechaHasta: '2026-08-19', codigoAlmacen: [],
    })).toThrow();
    expect(() => esquemaFiltrosDespachados.parse({ codigoAlmacen: 'BODEGA;DROP' })).toThrow();
  });
});
