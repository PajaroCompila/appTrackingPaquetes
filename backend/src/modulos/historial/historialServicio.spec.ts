import { describe, expect, it, vi } from 'vitest';
import { HistorialServicio } from './historialServicio.js';
import type { HistorialRepositorio } from './historialRepositorio.js';
import type { HistorialR1Repositorio } from './historialR1Repositorio.js';

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

  it('delega el listado por artículos sin consultar detalles uno por uno', async () => {
    const repositorio = {} as HistorialRepositorio;
    const repositorioConsulta = { buscarArticulos: vi.fn().mockResolvedValue({
      registros: [], pagina: 1, cantidadPorPagina: 25, hayMas: false,
    }) } as unknown as HistorialR1Repositorio;
    const filtros = { fechaDesde: '2026-08-01', fechaHasta: '2026-08-28',
      codigosAlmacen: ['BSPS01'], pagina: 1, cantidadPorPagina: 25 };
    await expect(new HistorialServicio(repositorio, repositorioConsulta)
      .buscarArticulos(filtros)).resolves.toMatchObject({ pagina: 1, hayMas: false });
    expect(repositorioConsulta.buscarArticulos).toHaveBeenCalledOnce();
    expect(repositorioConsulta.buscarArticulos).toHaveBeenCalledWith(filtros);
  });
});
