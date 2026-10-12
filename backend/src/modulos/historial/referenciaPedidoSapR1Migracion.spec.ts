import { describe, expect, it } from 'vitest';
import { MIGRACION_REFERENCIA_PEDIDO_SAP_R1 } from './referenciaPedidoSapR1Migracion.js';

describe('migración de referencias SAP para pedidos R1', () => {
  it('crea la tabla únicamente en la base local y conserva ambas referencias', () => {
    expect(MIGRACION_REFERENCIA_PEDIDO_SAP_R1).toContain("DB_NAME() <> N'PedidosBodega'");
    expect(MIGRACION_REFERENCIA_PEDIDO_SAP_R1).toContain('ReferenciaPedidoSapR1');
    expect(MIGRACION_REFERENCIA_PEDIDO_SAP_R1).toContain('folioPedido');
    expect(MIGRACION_REFERENCIA_PEDIDO_SAP_R1).toContain('numeroPedidoSap');
    expect(MIGRACION_REFERENCIA_PEDIDO_SAP_R1).not.toMatch(/\b(?:ORDR|SO1_01VENTA)\b/);
  });
});
