import { describe, expect, it } from 'vitest';
import { duracionHistorialMs, duracionPedidoMs, formatearDuracionPedido } from './tiempo-pedido';

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

  it('prioriza despachadoEn sobre los timestamps terminales y de ingreso a Historial', () => {
    const pedido = { fechaEntradaCola: '2026-10-05T17:02:44.655Z',
      despachadoEn: '2026-10-05T17:04:15.608Z',
      validadoDetectadoEn: '2026-10-05T17:05:48.796Z',
      historialIngresadoEn: '2026-10-05T17:06:00.000Z' };
    expect(formatearDuracionPedido(duracionHistorialMs(pedido))).toBe('01:30');
  });

  it('usa el primer evento terminal real cuando no hubo despacho local', () => {
    const pedido = { fechaHoraPedido: '2026-10-05T10:28:00', despachadoEn: null,
      validadoDetectadoEn: '2026-10-05T16:31:20.291Z',
      historialIngresadoEn: '2026-10-05T16:31:20.291Z' };
    const resultado = formatearDuracionPedido(duracionHistorialMs(pedido));
    expect(resultado).toBe('03:20');
    expect(resultado).not.toBe('No disponible');
  });

  it('usa el ingreso persistido a Historial y nunca produce un tiempo negativo', () => {
    const pedido = { fechaEntradaCola: '2026-10-05T17:00:00.000Z', despachadoEn: null,
      validadoDetectadoEn: '2026-10-05T16:59:00.000Z',
      historialIngresadoEn: '2026-10-05T17:03:00.000Z' };
    const resultado = formatearDuracionPedido(duracionHistorialMs(pedido));
    expect(resultado).toBe('03:00');
    expect(resultado).not.toBe('No disponible');
  });
});
