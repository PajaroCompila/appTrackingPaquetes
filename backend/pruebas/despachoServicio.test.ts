import { describe, expect, it, vi } from 'vitest';
import type { IDespachoRepositorio } from '../src/modulos/despachos/despachoRepositorio.js';
import { claveLineaDespachada } from '../src/modulos/despachos/despachoRepositorio.js';
import { DespachoServicio } from '../src/modulos/despachos/despachoServicio.js';
import type {
  IdentidadLineaDespacho,
  LineaDespachoOrigenRepositorio,
  LineaDespachoValidada,
} from '../src/modulos/despachos/lineaDespachoOrigenRepositorio.js';

const identidades: IdentidadLineaDespacho[] = [
  { idOrigen: 'R1:F1', identificadorDetalle: '1' },
  { idOrigen: 'SAP:22', identificadorDetalle: '3' },
];

function linea(identidad: IdentidadLineaDespacho): LineaDespachoValidada {
  const origen = identidad.idOrigen.startsWith('R1:') ? 'R1' : 'SAP';
  const articulo = { identificadorDetalle: identidad.identificadorDetalle,
    codigoArticulo: 'A1', descripcion: 'Artículo', cantidad: 1,
    codigoAlmacen: 'B1', nombreAlmacen: 'Bodega' };
  return { ...identidad, articulo, pedido: {
    idOrigen: identidad.idOrigen, origenPedido: origen, creadoEnR1: origen === 'R1',
    sapDocEntry: origen === 'SAP' ? '22' : null, folioPedido: 'F1', numeroPedido: '100',
    codigoVenta: null, codigoVendedor: null, nombreVendedor: 'Vendedor',
    codigosAlmacen: ['B1'], nombresBodega: 'Bodega', fechaHoraPedido: null,
    codigoEstadoVenta: 'A', codigoSincronizacion: null, articulos: [articulo],
  } };
}

function dependencias(lineas = identidades.map(linea)) {
  const despachoRepositorio: IDespachoRepositorio = {
    identidadesLineas: vi.fn().mockResolvedValue(new Set()),
    guardarLineas: vi.fn().mockResolvedValue({ transferidas: identidades }),
    listar: vi.fn(), obtener: vi.fn(),
  };
  const origenRepositorio = {
    obtenerLineas: vi.fn().mockResolvedValue(lineas),
  } as unknown as LineaDespachoOrigenRepositorio;
  return { despachoRepositorio, origenRepositorio };
}

describe('DespachoServicio', () => {
  it('valida en bloque y persiste líneas de pedidos distintos en una operación', async () => {
    const { despachoRepositorio, origenRepositorio } = dependencias();
    const resultado = await new DespachoServicio(despachoRepositorio, origenRepositorio)
      .transferir(identidades, '00000000-0000-0000-0000-000000000001');

    expect(origenRepositorio.obtenerLineas).toHaveBeenCalledOnce();
    expect(despachoRepositorio.guardarLineas).toHaveBeenCalledOnce();
    expect(resultado.transferidas).toEqual(identidades);
    expect(resultado.rechazadas).toEqual([]);
  });

  it('rechaza una línea ya transferida sin realizar escrituras', async () => {
    const { despachoRepositorio, origenRepositorio } = dependencias();
    vi.mocked(despachoRepositorio.identidadesLineas).mockResolvedValue(new Set([
      claveLineaDespachada('R1:F1', '1'),
    ]));
    await expect(new DespachoServicio(despachoRepositorio, origenRepositorio)
      .transferir(identidades, 'usuario')).rejects.toMatchObject({ codigo: 'LINEA_YA_TRANSFERIDA' });
    expect(despachoRepositorio.guardarLineas).not.toHaveBeenCalled();
  });

  it('rechaza toda la operación si una identidad ya no existe', async () => {
    const { despachoRepositorio, origenRepositorio } = dependencias([linea(identidades[0]!)]);
    await expect(new DespachoServicio(despachoRepositorio, origenRepositorio)
      .transferir(identidades, 'usuario')).rejects.toMatchObject({ codigo: 'LINEA_NO_DISPONIBLE' });
    expect(despachoRepositorio.guardarLineas).not.toHaveBeenCalled();
  });
});
