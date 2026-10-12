import { describe, expect, it, vi } from 'vitest';
import type { PedidoHistorial } from './historial.interface.js';
import type { HistorialR1Repositorio } from './historialR1Repositorio.js';
import type { HistorialR1SnapshotRepositorio } from './historialR1SnapshotRepositorio.js';
import { HistorialR1SnapshotSincronizador } from './historialR1SnapshotSincronizador.js';
import type { ReferenciaPedidoSapR1Conciliador } from './referenciaPedidoSapR1Conciliador.js';

const provisional: PedidoHistorial = {
  idOrigen: 'R1:TSPS01:F1', origenPedido: 'R1', creadoEnR1: true, sapDocEntry: null,
  folioPedido: 'F1', numeroPedido: 'F1', codigoVenta: null, codigoVendedor: null,
  nombreVendedor: 'Vendedor', codigosAlmacen: ['TSPS01'], nombresBodega: 'Tienda Principal',
  fechaHoraPedido: '2026-10-12T08:00:00', codigoEstadoVenta: 'C', codigoSincronizacion: 'Y',
  articulos: [], estadoLocal: 'VALIDADO', estadoHistorial: 'Facturado', despachadoEn: null,
  validadoDetectadoEn: null, usuarioDespacho: null,
};

describe('persistencia del numero SAP conciliado', () => {
  it('mantiene el DocNum durante cinco ciclos aunque R1 siga entregando el folio', async () => {
    let ahora = Date.parse('2026-10-12T15:00:00Z');
    const buscar = vi.fn().mockResolvedValue({ registros: [provisional], pagina: 1,
      cantidadPorPagina: 100, totalRegistros: 1, hayMas: false });
    const guardarRango = vi.fn().mockResolvedValue(undefined);
    const conciliador = { conciliar: vi.fn(async (registros: PedidoHistorial[]) => ({
      registros: registros.map((registro) => ({ ...registro, numeroPedido: '101478227', sapDocEntry: '10' })),
      relacionados: 1, nuevos: 0, ambiguos: [], sapDisponible: true,
    })) } as unknown as ReferenciaPedidoSapR1Conciliador;
    const sincronizador = new HistorialR1SnapshotSincronizador(
      { buscar } as unknown as HistorialR1Repositorio,
      { guardarRango } as unknown as HistorialR1SnapshotRepositorio,
      () => ahora,
      conciliador,
    );

    for (let ciclo = 0; ciclo < 5; ciclo += 1) {
      await sincronizador.sincronizar('2026-10-12', '2026-10-12');
      ahora += 46_000;
    }

    expect(guardarRango).toHaveBeenCalledTimes(5);
    for (const llamada of guardarRango.mock.calls) {
      expect(llamada[2]).toEqual([expect.objectContaining({
        folioPedido: 'F1', numeroPedido: '101478227', sapDocEntry: '10',
      })]);
    }
  });
});
