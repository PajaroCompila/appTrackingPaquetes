import { describe, expect, it } from 'vitest';
import {
  GRUPOS_CLIENTE_SAP_PERMITIDOS,
  GRUPOS_CLIENTE_SAP_PERMITIDOS_SQL,
  esGrupoClienteSapPermitido,
} from './gruposClienteSap.js';

describe('grupos de clientes admitidos para pedidos directos SAP', () => {
  it('mantiene una lista explícita y exacta del 100 al 118', () => {
    expect(GRUPOS_CLIENTE_SAP_PERMITIDOS).toEqual([
      100, 101, 102, 103, 104, 105, 106, 107, 108, 109,
      110, 111, 112, 113, 114, 115, 116, 117, 118,
    ]);
    expect(GRUPOS_CLIENTE_SAP_PERMITIDOS_SQL).toBe(
      '100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118',
    );
  });

  it.each([100, 103, 106, 113, 118])('admite el grupo representativo %s', (grupo) => {
    expect(esGrupoClienteSapPermitido(grupo)).toBe(true);
  });

  it.each([99, 119, null, undefined])('rechaza el grupo fuera de la lista %s', (grupo) => {
    expect(esGrupoClienteSapPermitido(grupo)).toBe(false);
  });
});
