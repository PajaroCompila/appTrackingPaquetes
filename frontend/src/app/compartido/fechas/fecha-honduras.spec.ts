import { describe, expect, it } from 'vitest';
import { formatearFechaHoraHonduras } from './fecha-honduras';

describe('formatearFechaHoraHonduras', () => {
  it('convierte una fecha UTC a la hora de Honduras', () => {
    expect(formatearFechaHoraHonduras('2026-08-20T21:44:00Z'))
      .toBe('20/08/2026 3:44 p. m.');
  });

  it('conserva la hora operativa cuando la fuente no incluye zona horaria', () => {
    expect(formatearFechaHoraHonduras('2026-08-20T15:44:00'))
      .toBe('20/08/2026 3:44 p. m.');
  });
});
