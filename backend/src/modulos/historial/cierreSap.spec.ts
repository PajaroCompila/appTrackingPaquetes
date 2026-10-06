import { describe, expect, it } from 'vitest';
import { clasificarCierreSap, columnasEvidenciaCierreSap } from './cierreSap.js';

describe('cierre SAP', () => {
  it.each([
    [true, false, 'CERRADO CON ENTREGA'],
    [true, true, 'CERRADO CON FACTURA DIRECTA'],
    [false, true, 'CERRADO CON FACTURA DIRECTA'],
    [false, false, 'CERRADO SIN ENTREGA NI FACTURA'],
  ] as const)('clasifica entrega=%s facturaDirecta=%s', (entrega, factura, esperado) => {
    expect(clasificarCierreSap(entrega, factura)).toBe(esperado);
  });

  it('relaciona documentos destino válidos sin depender de RDR1.TargetType', () => {
    const sql = columnasEvidenciaCierreSap('pedido');
    expect(sql).toContain("lineaEntrega.[BaseType] = 17");
    expect(sql).toContain('lineaEntrega.[BaseEntry] = pedido.[DocEntry]');
    expect(sql).toContain("entrega.[CANCELED] = 'N'");
    expect(sql).toContain("lineaFactura.[BaseType] = 17");
    expect(sql).toContain('lineaFactura.[BaseEntry] = pedido.[DocEntry]');
    expect(sql).toContain("factura.[CANCELED] = 'N'");
    expect(sql).toContain('lineaFactura.[BaseType] = 15');
    expect(sql).toContain('lineaFactura.[BaseEntry] = entrega.[DocEntry]');
    expect(sql).not.toContain('RDR1');
    expect(sql).not.toContain('TargetType');
  });

  it('distingue una factura valida creada desde una entrega', () => {
    expect(clasificarCierreSap(true, false, true)).toBe('CERRADO CON FACTURA VIA ENTREGA');
  });
});
