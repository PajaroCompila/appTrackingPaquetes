import { describe, expect, it, vi } from 'vitest';
import { DespachoServicio } from './despachoServicio.js';
import { claveLineaDespachada, type IDespachoRepositorio } from './despachoRepositorio.js';
import type { LineaDespachoOrigenRepositorio, LineaDespachoValidada } from './lineaDespachoOrigenRepositorio.js';

const linea = (identificadorDetalle: string, codigoAlmacen: string): LineaDespachoValidada => ({
  idOrigen: 'SAP:10', identificadorDetalle,
  pedido: { idOrigen: 'SAP:10', origenPedido: 'SAP', creadoEnR1: false, sapDocEntry: '10',
    folioPedido: 'SAP:10', numeroPedido: '100', codigoVenta: null, codigoVendedor: null,
    nombreVendedor: null, codigosAlmacen: [codigoAlmacen], nombresBodega: null,
    fechaHoraPedido: '2026-08-15T10:00:00', codigoEstadoVenta: 'A', codigoSincronizacion: null,
    articulos: [] },
  articulo: { identificadorDetalle, codigoArticulo: `A${identificadorDetalle}`,
    descripcion: `Artículo ${identificadorDetalle}`, cantidad: 1, codigoAlmacen, nombreAlmacen: null },
});

describe('DespachoServicio', () => {
  it('transfiere exclusivamente las partidas SAP seleccionadas por su identidad estable', async () => {
    const seleccionadas = [linea('0', 'BSPS03'), linea('1', 'BSPS03')];
    const despacho = { identidadesLineas: vi.fn().mockResolvedValue(new Set()),
      guardarLineas: vi.fn().mockResolvedValue({ transferidas: seleccionadas.map(({ idOrigen,
        identificadorDetalle }) => ({ idOrigen, identificadorDetalle })) }) } as unknown as IDespachoRepositorio;
    const origen = { obtenerLineas: vi.fn().mockResolvedValue(seleccionadas) } as unknown as LineaDespachoOrigenRepositorio;

    await new DespachoServicio(despacho, origen).transferir([
      { idOrigen: 'SAP:10', identificadorDetalle: '0' },
      { idOrigen: 'SAP:10', identificadorDetalle: '1' },
    ], '00000000-0000-0000-0000-000000000001');

    expect(despacho.guardarLineas).toHaveBeenCalledWith(seleccionadas,
      '00000000-0000-0000-0000-000000000001');
    expect(seleccionadas.map(({ articulo }) => articulo.codigoAlmacen)).toEqual(['BSPS03', 'BSPS03']);
  });

  it('permite un segundo despacho parcial sin volver a transferir la primera partida', async () => {
    const segunda = linea('1', 'TSPS01');
    const despacho = { identidadesLineas: vi.fn().mockResolvedValue(new Set([
      claveLineaDespachada('SAP:10', '0'),
    ])), guardarLineas: vi.fn().mockResolvedValue({ transferidas: [{ idOrigen: 'SAP:10',
      identificadorDetalle: '1' }] }) } as unknown as IDespachoRepositorio;
    const origen = { obtenerLineas: vi.fn().mockResolvedValue([segunda]) } as unknown as LineaDespachoOrigenRepositorio;

    await expect(new DespachoServicio(despacho, origen).transferir([
      { idOrigen: 'SAP:10', identificadorDetalle: '1' },
    ], '00000000-0000-0000-0000-000000000001')).resolves.toMatchObject({
      transferidas: [{ idOrigen: 'SAP:10', identificadorDetalle: '1' }],
    });
    expect(despacho.guardarLineas).toHaveBeenCalledWith([segunda], expect.any(String));
  });

  it('rechaza una partida previamente despachada y evita duplicarla', async () => {
    const despacho = { identidadesLineas: vi.fn().mockResolvedValue(new Set([
      claveLineaDespachada('SAP:10', '0'),
    ])), guardarLineas: vi.fn() } as unknown as IDespachoRepositorio;
    const origen = { obtenerLineas: vi.fn() } as unknown as LineaDespachoOrigenRepositorio;

    await expect(new DespachoServicio(despacho, origen).transferir([
      { idOrigen: 'SAP:10', identificadorDetalle: '0' },
    ], '00000000-0000-0000-0000-000000000001')).rejects.toMatchObject({
      codigo: 'LINEA_YA_TRANSFERIDA', estadoHttp: 409,
    });
    expect(origen.obtenerLineas).not.toHaveBeenCalled();
    expect(despacho.guardarLineas).not.toHaveBeenCalled();
  });
});
