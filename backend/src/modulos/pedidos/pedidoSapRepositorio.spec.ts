import { describe, expect, it } from 'vitest';
import { esUsuarioSapEspecial } from './pedidoSapRepositorio.js';

describe('esUsuarioSapEspecial', () => {
  it.each(['TALLER01', 'SVENTA10', 'SVENTA11', 'SVENTA12', ' sventa10 '])(
    'clasifica únicamente el código especial exacto %s',
    (codigo) => expect(esUsuarioSapEspecial(codigo)).toBe(true),
  );

  it.each(['SVENTA1', 'SVENTA100', 'XSVENTA10', 'TALLER', null])(
    'no clasifica coincidencias parciales',
    (codigo) => expect(esUsuarioSapEspecial(codigo)).toBe(false),
  );
});
