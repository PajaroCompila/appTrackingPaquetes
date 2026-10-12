import { describe, expect, it, vi } from 'vitest';
import type { PedidoHistorial } from './historial.interface.js';
import {
  ReferenciaPedidoSapR1Conciliador,
  resolverReferenciasSapR1,
} from './referenciaPedidoSapR1Conciliador.js';
import {
  aplicarReferenciaSapR1,
  resolverNumeroPedidoMostrado,
  type ReferenciaPedidoSapR1Repositorio,
} from './referenciaPedidoSapR1Repositorio.js';

describe('prioridad del identificador visible', () => {
  it('prioriza DocNum y conserva el folio R1 como referencia independiente', () => {
    expect(resolverNumeroPedidoMostrado('F1', null)).toBe('F1');
    expect(resolverNumeroPedidoMostrado('F1', 101478227)).toBe('101478227');
    const original = pedido('F1');
    const resuelto = aplicarReferenciaSapR1(original, {
      idOrigen: original.idOrigen, codigoSucursal: 'TSPS01', folioPedido: 'F1',
      sapDocEntry: 10, numeroPedidoSap: '101478227',
    });
    expect(resuelto).toEqual(expect.objectContaining({
      folioPedido: 'F1', numeroPedido: '101478227', sapDocEntry: '10',
    }));
  });
});

const pedido = (folioPedido: string, sucursal = 'TSPS01'): PedidoHistorial => ({
  idOrigen: `R1:${sucursal}:${folioPedido}`, origenPedido: 'R1', creadoEnR1: true,
  sapDocEntry: null, folioPedido, numeroPedido: folioPedido, codigoVenta: null,
  codigoVendedor: null, nombreVendedor: null, codigosAlmacen: [], nombresBodega: null,
  fechaHoraPedido: '2026-10-12T08:00:00', codigoEstadoVenta: 'C',
  codigoSincronizacion: 'N', articulos: [], estadoLocal: 'VALIDADO',
  estadoHistorial: 'Facturado', despachadoEn: null, validadoDetectadoEn: null,
  usuarioDespacho: null,
});

describe('conciliación de números SAP para pedidos R1', () => {
  it('relaciona un folio unívoco y conserva el folio para trazabilidad', () => {
    const resultado = resolverReferenciasSapR1([pedido('SPSS04PE390849')], [{
      folioPedido: 'SPSS04PE390849', sapDocEntry: 968843, numeroPedidoSap: '101478390',
    }]);
    expect(resultado.ambiguos).toEqual([]);
    expect(resultado.referencias).toEqual([expect.objectContaining({
      idOrigen: 'R1:TSPS01:SPSS04PE390849', folioPedido: 'SPSS04PE390849',
      sapDocEntry: 968843, numeroPedidoSap: '101478390',
    })]);
  });

  it('no asigna cuando un folio apunta a más de un documento SAP', () => {
    const resultado = resolverReferenciasSapR1([pedido('F1')], [
      { folioPedido: 'F1', sapDocEntry: 10, numeroPedidoSap: '100' },
      { folioPedido: 'F1', sapDocEntry: 11, numeroPedidoSap: '101' },
    ]);
    expect(resultado.referencias).toEqual([]);
    expect(resultado.ambiguos).toEqual(['F1']);
  });

  it('consulta SAP solamente para referencias que aún no existen localmente', async () => {
    const existente = { idOrigen: 'R1:TSPS01:F1', codigoSucursal: 'TSPS01', folioPedido: 'F1',
      sapDocEntry: 10, numeroPedidoSap: '100' };
    const obtener = vi.fn().mockResolvedValue(new Map([[existente.idOrigen, existente]]));
    const guardar = vi.fn().mockResolvedValue([]);
    const consultar = vi.fn().mockResolvedValue([
      { folioPedido: 'F2', sapDocEntry: 11, numeroPedidoSap: '101' },
    ]);
    const conciliador = new ReferenciaPedidoSapR1Conciliador(
      { obtener, guardar } as unknown as ReferenciaPedidoSapR1Repositorio,
      consultar,
    );
    const resultado = await conciliador.conciliar([pedido('F1'), pedido('F2')]);
    expect(consultar).toHaveBeenCalledWith(['F2']);
    expect(guardar).toHaveBeenCalledOnce();
    expect(resultado.registros.map(({ folioPedido, numeroPedido, sapDocEntry }) =>
      ({ folioPedido, numeroPedido, sapDocEntry }))).toEqual([
      { folioPedido: 'F1', numeroPedido: '100', sapDocEntry: '10' },
      { folioPedido: 'F2', numeroPedido: '101', sapDocEntry: '11' },
    ]);
  });
});
