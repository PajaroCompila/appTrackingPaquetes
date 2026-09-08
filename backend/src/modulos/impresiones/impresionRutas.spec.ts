import { describe, expect, it } from 'vitest';
import { esquemaLineasImpresion } from './impresionRutas.js';

describe('esquemaLineasImpresion', () => {
  it('acepta identidades estables de artículos', () => {
    expect(esquemaLineasImpresion.parse({
      lineas: [{ idOrigen: ' R1:ABC ', identificadorDetalle: ' 12 ' }],
    })).toEqual({ lineas: [{ idOrigen: 'R1:ABC', identificadorDetalle: '12' }] });
  });

  it('rechaza una impresión sin artículos identificables', () => {
    expect(() => esquemaLineasImpresion.parse({ lineas: [] })).toThrow();
    expect(() => esquemaLineasImpresion.parse({
      lineas: [{ idOrigen: 'R1:ABC', identificadorDetalle: '' }],
    })).toThrow();
  });
});
