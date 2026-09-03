import { describe, expect, it } from 'vitest';
import { esFechaCalendarioValida, obtenerFechaLocalActual } from './estado-filtros-sesion';

describe('obtenerFechaLocalActual', () => {
  it('usa el día de Honduras aunque UTC ya esté en el día siguiente', () => {
    expect(obtenerFechaLocalActual(new Date('2026-09-04T02:30:00Z'))).toBe('2026-09-03');
  });

  it('cambia de día a la medianoche de Honduras', () => {
    expect(obtenerFechaLocalActual(new Date('2026-09-04T06:00:00Z'))).toBe('2026-09-04');
  });

  it('rechaza fechas con formato correcto pero día inexistente', () => {
    expect(esFechaCalendarioValida('2026-02-29')).toBe(false);
    expect(esFechaCalendarioValida('2026-09-03')).toBe(true);
  });
});
