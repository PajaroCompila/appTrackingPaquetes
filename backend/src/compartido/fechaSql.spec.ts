import { describe, expect, it } from 'vitest';
import { fechaSqlSinZona } from './fechaSql.js';

describe('fechaSqlSinZona', () => {
  it('conserva la hora operativa almacenada sin marcarla como UTC', () => {
    expect(fechaSqlSinZona(new Date('2026-08-20T12:35:00.000Z')))
      .toBe('2026-08-20T12:35:00');
  });

  it('acepta valores ausentes', () => {
    expect(fechaSqlSinZona(null)).toBeNull();
  });
});
