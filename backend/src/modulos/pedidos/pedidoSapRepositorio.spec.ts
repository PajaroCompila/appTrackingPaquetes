import { describe, expect, it } from 'vitest';
import { esUsuarioSapExcluidoSla } from './pedidoSapRepositorio.js';

describe('esUsuarioSapExcluidoSla', () => {
  it.each(['TALLER01', 'SVENTA10', 'SVENTA11', 'SVENTA12', ' sventa10 '])(
    'excluye únicamente el código exacto %s',
    (codigo) => expect(esUsuarioSapExcluidoSla(codigo)).toBe(true),
  );

  it.each(['SVENTA1', 'SVENTA100', 'XSVENTA10', 'TALLER', null])(
    'no excluye coincidencias parciales',
    (codigo) => expect(esUsuarioSapExcluidoSla(codigo)).toBe(false),
  );
});
