import { describe, expect, it } from 'vitest';
import { formatearFechaHoraHonduras } from './formatear-fecha-honduras';

describe('formatearFechaHoraHonduras', () => {
  it('conserva una hora local de R1 que no incluye zona', () => {
    expect(formatearFechaHoraHonduras('2026-08-28T12:25:00', false))
      .toBe('28/08/2026 12:25');
  });

  it('convierte un instante UTC real a America/Tegucigalpa', () => {
    expect(formatearFechaHoraHonduras('2026-08-28T18:25:00.000Z', false))
      .toBe('28/08/2026 12:25');
  });
});
