import { describe, expect, it } from 'vitest';
import { duracionPedidoMs, formatearDuracionPedido } from './tiempo-pedido';

describe('tiempo de pedido', () => {
  it.each([
    ['normal', false],
    ['especial', true],
  ])('mide un pedido %s pendiente desde la entrada a la cola', (_tipo, esEspecial) => {
    const pedido = { fechaEntradaCola: '2026-09-22T10:00:00.000Z', esEspecial };
    expect(formatearDuracionPedido(
      duracionPedidoMs(pedido, Date.parse('2026-09-22T10:23:00.000Z')),
    )).toBe('23:00');
  });

  it.each([
    ['normal', false],
    ['especial', true],
  ])('congela un pedido %s en la fecha real de despacho', (_tipo, esEspecial) => {
    const pedido = { fechaEntradaCola: '2026-09-22T09:19:00.000Z', esEspecial };
    expect(formatearDuracionPedido(
      duracionPedidoMs(pedido, '2026-09-22T09:35:00.000Z'),
    )).toBe('16:00');
  });

  it('prioriza la entrada a la cola sobre la fecha documental', () => {
    const pedido = {
      fechaEntradaCola: '2026-09-22T11:54:30.000Z',
      fechaHoraPedido: '2026-09-22T10:00:00.000Z',
    };
    expect(formatearDuracionPedido(
      duracionPedidoMs(pedido, '2026-09-22T12:00:00.000Z'),
    )).toBe('05:30');
  });
});
