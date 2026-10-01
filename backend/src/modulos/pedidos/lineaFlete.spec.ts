import { describe, expect, it } from 'vitest';
import { condicionLineaNoFleteSql, esLineaFlete } from './lineaFlete.js';

describe('exclusión de fletes', () => {
  it.each([
    ['FLETE CATEGORIA 1', 'ZONAS A B C'],
    ['FLETE CATEGORIA 2', 'ZONAS A B C'],
    ['FLETE CATEGORIA 3', 'ZONAS A B C'],
    ['FLETE CATEGORIA 4', 'ZONAS A B C'],
    ['FLETE-LOCAL', 'ZONA LOCAL'],
    ['SPSFLETES', 'FLETE SAN PEDRO SULA'],
    ['ART-1', 'Cobro de flete especial'],
  ])('identifica %s', (codigo, descripcion) => {
    expect(esLineaFlete(codigo, descripcion)).toBe(true);
  });

  it('conserva artículos que no son flete', () => {
    expect(esLineaFlete('YAM-MODX7', 'Sintetizador')).toBe(false);
    expect(esLineaFlete(null, null)).toBe(false);
  });

  it('genera la condición para código y descripción', () => {
    const condicion = condicionLineaNoFleteSql('linea.ItemCode', 'linea.Dscription');
    expect(condicion).toContain("UPPER(ISNULL(linea.ItemCode, '')) NOT LIKE '%FLETE%'");
    expect(condicion).toContain("UPPER(ISNULL(linea.Dscription, '')) NOT LIKE '%FLETE%'");
  });
});
