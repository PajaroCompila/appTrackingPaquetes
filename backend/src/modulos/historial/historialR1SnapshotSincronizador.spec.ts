import { describe, expect, it, vi } from 'vitest';
import type { PedidoHistorial } from './historial.interface.js';
import type { HistorialR1Repositorio } from './historialR1Repositorio.js';
import type { HistorialR1SnapshotRepositorio } from './historialR1SnapshotRepositorio.js';
import { HistorialR1SnapshotSincronizador, fechaActualHonduras } from './historialR1SnapshotSincronizador.js';
import type { ReferenciaPedidoSapR1Conciliador } from './referenciaPedidoSapR1Conciliador.js';

const pedido = (idOrigen: string): PedidoHistorial => ({
  idOrigen,
  origenPedido: 'R1',
  creadoEnR1: true,
  sapDocEntry: null,
  folioPedido: idOrigen,
  numeroPedido: idOrigen,
  codigoVenta: null,
  codigoVendedor: null,
  nombreVendedor: 'Vendedor',
  codigosAlmacen: ['TSPS01'],
  nombresBodega: 'Tienda Principal',
  fechaHoraPedido: '2026-10-07T08:00:00',
  codigoEstadoVenta: 'C',
  codigoSincronizacion: 'Y',
  articulos: [],
  estadoLocal: 'VALIDADO',
  estadoHistorial: 'Facturado',
  despachadoEn: null,
  validadoDetectadoEn: null,
  usuarioDespacho: null,
});

const conciliadorPassthrough = (): ReferenciaPedidoSapR1Conciliador => ({
  conciliar: vi.fn(async (registros: PedidoHistorial[]) => ({ registros,
    relacionados: 0, nuevos: 0, ambiguos: [], sapDisponible: true })),
} as unknown as ReferenciaPedidoSapR1Conciliador);

describe('HistorialR1SnapshotSincronizador', () => {
  it('pagina R1 en segundo plano y reemplaza el rango local solo al completar todas las fuentes', async () => {
    const buscar = vi.fn()
      .mockResolvedValueOnce({ registros: [pedido('R1:TSPS01:1')], pagina: 1,
        cantidadPorPagina: 100, totalRegistros: 2, hayMas: true })
      .mockResolvedValueOnce({ registros: [pedido('R1:TCIR01:2')], pagina: 2,
        cantidadPorPagina: 100, totalRegistros: 2, hayMas: false });
    const guardarRango = vi.fn().mockResolvedValue(undefined);
    const sincronizador = new HistorialR1SnapshotSincronizador(
      { buscar } as unknown as HistorialR1Repositorio,
      { guardarRango } as unknown as HistorialR1SnapshotRepositorio,
      () => Date.parse('2026-10-07T15:00:00Z'),
      conciliadorPassthrough(),
    );

    await sincronizador.sincronizar('2026-10-01', '2026-10-07');

    expect(buscar).toHaveBeenCalledTimes(2);
    expect(buscar.mock.calls[0]?.[0]).toMatchObject({
      fechaDesde: '2026-10-01', fechaHasta: '2026-10-07', codigosAlmacen: [], pagina: 1,
    });
    expect(guardarRango).toHaveBeenCalledWith('2026-10-01', '2026-10-07', [
      expect.objectContaining({ idOrigen: 'R1:TSPS01:1' }),
      expect.objectContaining({ idOrigen: 'R1:TCIR01:2' }),
    ], true);
  });

  it('comparte una actualización concurrente y evita repetirla durante su vigencia', async () => {
    let resolver!: (valor: unknown) => void;
    const buscar = vi.fn().mockReturnValue(new Promise((resolve) => { resolver = resolve; }));
    const guardarRango = vi.fn().mockResolvedValue(undefined);
    let ahora = Date.parse('2026-10-07T15:00:00Z');
    const sincronizador = new HistorialR1SnapshotSincronizador(
      { buscar } as unknown as HistorialR1Repositorio,
      { guardarRango } as unknown as HistorialR1SnapshotRepositorio,
      () => ahora,
      conciliadorPassthrough(),
    );

    const primera = sincronizador.sincronizar('2026-10-07', '2026-10-07');
    const concurrente = sincronizador.sincronizar('2026-10-07', '2026-10-07');
    expect(primera).toBe(concurrente);
    resolver({ registros: [], pagina: 1, cantidadPorPagina: 100, totalRegistros: 0, hayMas: false });
    await primera;
    await sincronizador.sincronizar('2026-10-07', '2026-10-07');
    expect(buscar).toHaveBeenCalledOnce();

    ahora += 46_000;
    buscar.mockResolvedValueOnce({ registros: [], pagina: 1, cantidadPorPagina: 100,
      totalRegistros: 0, hayMas: false });
    await sincronizador.sincronizar('2026-10-07', '2026-10-07');
    expect(buscar).toHaveBeenCalledTimes(2);
  });

  it('reemplaza el mismo folio provisional cuando R1 recibe el documento SAP', async () => {
    let ahora = Date.parse('2026-10-12T15:00:00Z');
    const provisional = { ...pedido('R1:TSPS01:SPSS04PE390849'),
      folioPedido: 'SPSS04PE390849', numeroPedido: 'SPSS04PE390849' };
    const sincronizado = { ...provisional, numeroPedido: '101478390', codigoSincronizacion: 'Y' };
    const buscar = vi.fn()
      .mockResolvedValueOnce({ registros: [provisional], pagina: 1,
        cantidadPorPagina: 100, totalRegistros: 1, hayMas: false })
      .mockResolvedValueOnce({ registros: [sincronizado], pagina: 1,
        cantidadPorPagina: 100, totalRegistros: 1, hayMas: false });
    const guardarRango = vi.fn().mockResolvedValue(undefined);
    const sincronizador = new HistorialR1SnapshotSincronizador(
      { buscar } as unknown as HistorialR1Repositorio,
      { guardarRango } as unknown as HistorialR1SnapshotRepositorio,
      () => ahora,
      conciliadorPassthrough(),
    );

    await sincronizador.sincronizar('2026-10-12', '2026-10-12');
    ahora += 46_000;
    await sincronizador.sincronizar('2026-10-12', '2026-10-12');

    expect(guardarRango).toHaveBeenNthCalledWith(1, '2026-10-12', '2026-10-12', [
      expect.objectContaining({ idOrigen: provisional.idOrigen, numeroPedido: 'SPSS04PE390849' }),
    ], true);
    expect(guardarRango).toHaveBeenNthCalledWith(2, '2026-10-12', '2026-10-12', [
      expect.objectContaining({ idOrigen: provisional.idOrigen, numeroPedido: '101478390' }),
    ], true);
  });

  it('calcula el día operativo con la zona horaria de Honduras', () => {
    expect(fechaActualHonduras(new Date('2026-10-08T03:00:00Z'))).toBe('2026-10-07');
  });
});
