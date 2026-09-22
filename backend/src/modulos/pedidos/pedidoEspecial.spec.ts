import { describe, expect, it } from 'vitest';
import { esVendedorEspecial } from './pedidoEspecial.js';

describe('esVendedorEspecial', () => {
  it.each([
    'SPS Eliasar Gamaliel Gomez Cortes',
    'SPS Elisaar Gamaliel Gomez Cortes',
    'SPS Jensy Marilu Lainez Lainez',
    'SPS Jose Nahum Diaz Diaz',
    'SPS Jose Naun Diaz',
  ])('clasifica al vendedor especial %s', (nombreVendedor) => {
    expect(esVendedorEspecial(nombreVendedor)).toBe(true);
  });

  it.each([
    'SPS Elias Gomez Cortes',
    'SPS Jose Diaz Diaz',
    'SPS Andrea Nicolle Rivas Claros',
    '',
    null,
  ])('no clasifica como especial a %s', (nombreVendedor) => {
    expect(esVendedorEspecial(nombreVendedor)).toBe(false);
  });
});
