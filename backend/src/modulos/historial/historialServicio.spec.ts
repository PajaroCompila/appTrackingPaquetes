import { describe, expect, it, vi } from 'vitest';
import { HistorialServicio } from './historialServicio.js';
import type { HistorialRepositorio } from './historialRepositorio.js';
import type { HistorialR1Repositorio } from './historialR1Repositorio.js';
import type { PedidoHistorial } from './historial.interface.js';

const registro = (idOrigen: string, estadoLocal: 'VALIDADO' | 'DESPACHADO', fecha: string): PedidoHistorial => ({
  idOrigen, origenPedido: idOrigen.startsWith('SAP:') ? 'SAP' : 'R1',
  creadoEnR1: !idOrigen.startsWith('SAP:'), sapDocEntry: idOrigen.startsWith('SAP:') ? '10' : null,
  folioPedido: idOrigen, numeroPedido: idOrigen, codigoVenta: null, codigoVendedor: null,
  nombreVendedor: null, codigosAlmacen: ['B1'], nombresBodega: 'Bodega 1', fechaHoraPedido: fecha,
  codigoEstadoVenta: estadoLocal, codigoSincronizacion: null, articulos: [], estadoLocal,
  despachadoEn: fecha, validadoDetectadoEn: estadoLocal === 'VALIDADO' ? fecha : null,
  usuarioDespacho: 'Operador',
});

describe('HistorialServicio', () => {
  it('valida pedidos con Y y omite pedidos cerrados con C', async () => {
    const repositorio = {
      obtenerDespachadosPendientes: vi.fn().mockResolvedValue([
        { idOrigen: 'R1:F1', folioPedido: 'F1' },
        { idOrigen: 'R1:F2', folioPedido: 'F2' },
        { idOrigen: 'R1:F3', folioPedido: 'F3' },
      ]),
      obtenerEstadosR1: vi.fn().mockResolvedValue(new Map([
        ['R1:F1', { codigoSucursal: 'SPS', codigoEstadoVenta: 'C', verificado: false }],
        ['R1:F2', { codigoSucursal: 'SPS', codigoEstadoVenta: 'A', verificado: true }],
        ['R1:F3', { codigoSucursal: 'SPS', codigoEstadoVenta: 'C', verificado: true }],
      ])),
      marcarCerrados: vi.fn().mockResolvedValue(1),
      marcarValidados: vi.fn().mockResolvedValue(2),
    } as unknown as HistorialRepositorio;
    const servicio = new HistorialServicio(repositorio);

    await expect(servicio.sincronizar()).resolves.toBe(3);
    expect(repositorio.obtenerEstadosR1).toHaveBeenCalledWith([
      { idOrigen: 'R1:F1', folioPedido: 'F1' },
      { idOrigen: 'R1:F2', folioPedido: 'F2' },
      { idOrigen: 'R1:F3', folioPedido: 'F3' },
    ]);
    expect(repositorio.marcarCerrados).toHaveBeenCalledWith(['R1:F1']);
    expect(repositorio.marcarValidados).toHaveBeenCalledWith([
      { idOrigen: 'R1:F2', codigoSucursal: 'SPS' },
      { idOrigen: 'R1:F3', codigoSucursal: 'SPS' },
    ]);
  });

  it('es idempotente cuando ya no quedan cabeceras en DESPACHADO', async () => {
    const repositorio = {
      obtenerDespachadosPendientes: vi.fn().mockResolvedValue([]),
      obtenerEstadosR1: vi.fn().mockResolvedValue(new Map()),
      marcarCerrados: vi.fn().mockResolvedValue(0),
      marcarValidados: vi.fn().mockResolvedValue(0),
    } as unknown as HistorialRepositorio;

    await expect(new HistorialServicio(repositorio).sincronizar()).resolves.toBe(0);
    expect(repositorio.marcarCerrados).toHaveBeenCalledWith([]);
    expect(repositorio.marcarValidados).toHaveBeenCalledWith([]);
  });

  it('combina el historial validado de R1 con despachos SAP conservados localmente', async () => {
    const sap = registro('SAP:10', 'DESPACHADO', '2026-08-15T12:00:00.000Z');
    const r1 = registro('R1:TSPS01:F1', 'VALIDADO', '2026-08-15T11:00:00.000Z');
    const repositorio = { buscarHistorial: vi.fn().mockResolvedValue({ registros: [sap], pagina: 1,
      cantidadPorPagina: 25, hayMas: false }) } as unknown as HistorialRepositorio;
    const repositorioR1 = { buscar: vi.fn().mockResolvedValue({ registros: [r1], pagina: 1,
      cantidadPorPagina: 25, hayMas: false }) } as unknown as HistorialR1Repositorio;

    const resultado = await new HistorialServicio(repositorio, repositorioR1).buscar({
      fechaDesde: '2026-08-01', fechaHasta: '2026-08-15', codigosAlmacen: [], pagina: 1,
      cantidadPorPagina: 25,
    });

    expect(resultado.registros).toEqual([sap, r1]);
    expect(sap.estadoLocal).toBe('DESPACHADO');
    expect(sap.validadoDetectadoEn).toBeNull();
  });

  it('recupera el detalle SAP desde PedidosBodega sin consultar nuevamente SAP', async () => {
    const sap = registro('SAP:10', 'DESPACHADO', '2026-08-15T12:00:00.000Z');
    const repositorio = { obtenerHistorial: vi.fn().mockResolvedValue(sap) } as unknown as HistorialRepositorio;
    const repositorioR1 = { obtener: vi.fn() } as unknown as HistorialR1Repositorio;

    await expect(new HistorialServicio(repositorio, repositorioR1).obtener('SAP:10')).resolves.toEqual(sap);
    expect(repositorio.obtenerHistorial).toHaveBeenCalledWith('SAP:10');
    expect(repositorioR1.obtener).not.toHaveBeenCalled();
  });
});
