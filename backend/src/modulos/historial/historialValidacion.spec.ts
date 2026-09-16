import { describe, expect, it } from 'vitest';
import { esquemaFiltrosHistorial } from './historialValidacion.js';

describe('esquemaFiltrosHistorial', () => {
  it('acepta la clasificación independiente del historial', () => {
    const base = { fechaDesde: '2026-09-14', fechaHasta: '2026-09-14', codigoAlmacen: [] };

    expect(esquemaFiltrosHistorial.parse({ ...base, clasificacion: 'normal' }))
      .toMatchObject({ clasificacion: 'normal' });
    expect(esquemaFiltrosHistorial.parse({ ...base, clasificacion: 'especial' }))
      .toMatchObject({ clasificacion: 'especial' });
  });
});
