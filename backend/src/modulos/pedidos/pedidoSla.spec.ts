import { describe, expect, it } from 'vitest';
import { esVendedorEspecialSinSla } from './pedidoSla.js';

describe('esVendedorEspecialSinSla', () => {
  it.each([
    'SPS Eliasar Gamaliel Gomez Cortes',
    'SPS Elisaar Gamaliel Gomez Cortes',
    'SPS Jensy Marilu Lainez Lainez',
    'SPS Jose Nahum Diaz Diaz',
    'SPS Jose Naun Diaz',
  ])('excluye del tiempo al vendedor especial %s', (nombreVendedor) => {
    expect(esVendedorEspecialSinSla(nombreVendedor)).toBe(true);
  });

  it.each([
    'SPS Elias Gomez Cortes',
    'SPS Jose Diaz Diaz',
    'SPS Andrea Nicolle Rivas Claros',
    '',
    null,
  ])('mantiene el SLA para %s', (nombreVendedor) => {
    expect(esVendedorEspecialSinSla(nombreVendedor)).toBe(false);
  });
});
