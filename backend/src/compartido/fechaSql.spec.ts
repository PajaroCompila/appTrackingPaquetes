import { describe, expect, it } from 'vitest';
import { fechaSqlSinZona, fechaTextoSinZonaParaSql } from './fechaSql.js';

describe('fechaSqlSinZona', () => {
  it('conserva la hora operativa almacenada sin marcarla como UTC', () => {
    expect(fechaSqlSinZona(new Date('2026-08-20T12:35:00.000Z')))
      .toBe('2026-08-20T12:35:00');
  });

  it('acepta valores ausentes', () => {
    expect(fechaSqlSinZona(null)).toBeNull();
  });

  it('conserva la hora local al prepararla para una columna datetime2', () => {
    expect(fechaTextoSinZonaParaSql('2026-09-03T14:42:00')?.toISOString())
      .toBe('2026-09-03T14:42:00.000Z');
  });

  it('rechaza fechas con zona porque la fuente debe entregar hora local', () => {
    expect(() => fechaTextoSinZonaParaSql('2026-09-03T14:42:00-06:00')).toThrow(RangeError);
  });
});
