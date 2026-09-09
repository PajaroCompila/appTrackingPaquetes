import { describe, expect, it, vi } from 'vitest';
import { ErrorDependenciaDatos } from '../src/compartido/errores/errorDependenciaDatos.js';
import type { IPedidoRepositorio } from '../src/modulos/pedidos/pedidoRepositorio.js';
import { PedidoServicio } from '../src/modulos/pedidos/pedidoServicio.js';
import type { IPedidoSapRepositorio } from '../src/modulos/pedidos/pedidoSapRepositorio.js';
import type { PedidoResumen } from '../src/modulos/pedidos/pedido.interface.js';
import type { IDespachoRepositorio } from '../src/modulos/despachos/despachoRepositorio.js';
import { claveLineaDespachada } from '../src/modulos/despachos/despachoRepositorio.js';

const paginaVacia = {
  pedidos: [], pagina: 1, cantidadPorPagina: 25, totalRegistros: 0, hayMas: false,
};

function crearRepositorio(): IPedidoRepositorio {
  return {
    buscarPedidos: vi.fn().mockResolvedValue(paginaVacia),
    obtenerDetallePedido: vi.fn().mockResolvedValue(null),
  };
}

const crearPedido = (origen: 'R1' | 'SAP', clave: string, numeroPedido: string): PedidoResumen => ({
  idOrigen: `${origen}:${clave}`, origenPedido: origen, creadoEnR1: origen === 'R1',
  sapDocEntry: origen === 'SAP' ? clave : null, folioPedido: origen === 'R1' ? clave : `SAP:${clave}`,
  numeroPedido, codigoVenta: null, codigoVendedor: null, nombreVendedor: 'Vendedor',
  codigosAlmacen: ['B1'], nombresBodega: 'Bodega', fechaHoraPedido: '2026-07-31T12:00:00',
  codigoEstadoVenta: 'A', codigoSincronizacion: null,
  articulos: [{ identificadorDetalle: '1', codigoArticulo: 'A1', descripcion: 'Artículo', cantidad: 1, codigoAlmacen: 'B1', nombreAlmacen: 'Bodega' }],
});

const crearRepositorioSap = (pedidos: PedidoResumen[] = []): IPedidoSapRepositorio => ({
  buscarPedidos: vi.fn().mockResolvedValue({
    pedidos, pagina: 1, cantidadPorPagina: 25, totalRegistros: pedidos.length, hayMas: false,
  }),
  obtenerDetallePedido: vi.fn().mockResolvedValue(null),
});

describe('PedidoServicio', () => {
  it('devuelve 404 cuando el folio no existe', async () => {
    const servicio = new PedidoServicio(crearRepositorio());

    await expect(servicio.obtenerDetallePedido('INEXISTENTE')).rejects.toMatchObject({
      estadoHttp: 404,
      codigo: 'PEDIDO_NO_ENCONTRADO',
    });
  });

  it('traduce una dependencia no disponible a HTTP 503', async () => {
    const repositorio = crearRepositorio();
    vi.mocked(repositorio.buscarPedidos).mockRejectedValue(new ErrorDependenciaDatos());
    const servicio = new PedidoServicio(repositorio);

    await expect(
      servicio.buscarPedidos({ pagina: 1, cantidadPorPagina: 25 }),
    ).rejects.toMatchObject({ estadoHttp: 503, codigo: 'SISTEMA_ORIGEN_NO_DISPONIBLE' });
  });

  it('muestra R1 primero e incorpora SAP en la siguiente consulta', async () => {
    const r1 = crearRepositorio();
    vi.mocked(r1.buscarPedidos).mockResolvedValue({
      ...paginaVacia, pedidos: [crearPedido('R1', 'F1', '100')], totalRegistros: 1,
    });
    const sap = crearRepositorioSap([crearPedido('SAP', '22', '100')]);
    const servicio = new PedidoServicio(r1, sap);
    const primeraConsulta = await servicio.buscarPedidos({ pagina: 1, cantidadPorPagina: 25 });
    await Promise.resolve();
    const resultado = await servicio.buscarPedidos({ pagina: 1, cantidadPorPagina: 25 });

    expect(primeraConsulta.pedidos.map((p) => p.idOrigen)).toEqual(['R1:F1']);
    expect(resultado.pedidos.map((p) => p.idOrigen).sort()).toEqual(['R1:F1', 'SAP:22']);
    expect(resultado.pedidos.find((p) => p.origenPedido === 'R1')?.creadoEnR1).toBe(true);
    expect(resultado.pedidos.find((p) => p.origenPedido === 'SAP')?.creadoEnR1).toBe(false);
  });

  it('no espera a SAP cuando RetailOne ya respondió', async () => {
    const r1 = crearRepositorio();
    vi.mocked(r1.buscarPedidos).mockResolvedValue({
      ...paginaVacia, pedidos: [crearPedido('R1', 'F1', '100')], totalRegistros: 1,
    });
    let completarSap: (() => void) | undefined;
    const sap = crearRepositorioSap();
    vi.mocked(sap.buscarPedidos).mockImplementationOnce(() => new Promise((resolve) => {
      completarSap = () => resolve(paginaVacia);
    }));
    const servicio = new PedidoServicio(r1, sap);

    const resultado = await servicio.buscarPedidos({ pagina: 1, cantidadPorPagina: 25 });

    expect(resultado.pedidos.map((p) => p.idOrigen)).toEqual(['R1:F1']);
    expect(completarSap).toBeTypeOf('function');
    completarSap?.();
  });

  it('conserva R1 e informa disponibilidad parcial cuando SAP falla', async () => {
    const r1 = crearRepositorio();
    vi.mocked(r1.buscarPedidos).mockResolvedValue({
      ...paginaVacia, pedidos: [crearPedido('R1', 'F1', '100')], totalRegistros: 1,
    });
    const sap = crearRepositorioSap();
    vi.mocked(sap.buscarPedidos).mockRejectedValue(new Error('SAP no disponible'));
    const resultado = await new PedidoServicio(r1, sap).buscarPedidos({ pagina: 1, cantidadPorPagina: 25 });

    expect(resultado.pedidos).toHaveLength(1);
    expect(resultado.fuentes?.sap).toBe('no_disponible');
    expect(resultado.fuentes?.retailOne).toBe('disponible');
  });

  it('conserva SAP e informa disponibilidad parcial cuando RetailOne falla', async () => {
    const r1 = crearRepositorio();
    vi.mocked(r1.buscarPedidos).mockRejectedValue(new ErrorDependenciaDatos());
    const sap = crearRepositorioSap([crearPedido('SAP', '22', '100')]);
    const resultado = await new PedidoServicio(r1, sap).buscarPedidos({ pagina: 1, cantidadPorPagina: 25 });

    expect(resultado.pedidos.map((p) => p.idOrigen)).toEqual(['SAP:22']);
    expect(resultado.fuentes).toEqual({ retailOne: 'no_disponible', sap: 'disponible' });
  });

  it('devuelve error controlado cuando ambas fuentes fallan', async () => {
    const r1 = crearRepositorio();
    vi.mocked(r1.buscarPedidos).mockRejectedValue(new Error('cadena sensible simulada'));
    const sap = crearRepositorioSap();
    vi.mocked(sap.buscarPedidos).mockRejectedValue(new Error('credencial sensible simulada'));
    const servicio = new PedidoServicio(r1, sap);

    await expect(servicio.buscarPedidos({ pagina: 1, cantidadPorPagina: 25 }))
      .rejects.toMatchObject({ estadoHttp: 503, codigo: 'SISTEMA_ORIGEN_NO_DISPONIBLE' });
  });

  it('excluye solamente la línea transferida y conserva las restantes del pedido', async () => {
    const pedido = crearPedido('R1', 'F1', '100');
    pedido.articulos.push({ identificadorDetalle: '2', codigoArticulo: 'A2',
      descripcion: 'Tienda', cantidad: 1, codigoAlmacen: 'TSPS01', nombreAlmacen: 'Tienda' });
    const r1 = crearRepositorio();
    vi.mocked(r1.buscarPedidos).mockResolvedValue({
      ...paginaVacia, pedidos: [pedido], totalRegistros: 1,
    });
    const despachos: IDespachoRepositorio = {
      identidadesLineas: vi.fn().mockResolvedValue(new Set([
        claveLineaDespachada('R1:F1', '1'),
      ])),
      guardarLineas: vi.fn(), listar: vi.fn(), obtener: vi.fn(),
    };
    const resultado = await new PedidoServicio(r1, crearRepositorioSap(), despachos)
      .buscarPedidos({ pagina: 1, cantidadPorPagina: 25 });

    expect(resultado.pedidos).toHaveLength(1);
    expect(resultado.pedidos[0]?.articulos.map((articulo) => articulo.identificadorDetalle))
      .toEqual(['2']);
    expect(resultado.totalRegistros).toBe(1);
  });

  it('pagina partidas en Articulos y cabeceras en Pedido', async () => {
    const pedido = crearPedido('R1', 'F1', '100');
    pedido.articulos = Array.from({ length: 30 }, (_, indice) => ({
      identificadorDetalle: String(indice + 1),
      codigoArticulo: `A${indice + 1}`,
      descripcion: `Articulo ${indice + 1}`,
      cantidad: 1,
      codigoAlmacen: 'B1',
      nombreAlmacen: 'Bodega',
    }));
    const r1 = crearRepositorio();
    vi.mocked(r1.buscarPedidos).mockResolvedValue({
      ...paginaVacia, pedidos: [pedido], totalRegistros: 1,
    });
    const servicio = new PedidoServicio(r1, crearRepositorioSap());

    const articulos = await servicio.buscarPedidos({
      pagina: 1, cantidadPorPagina: 25, vista: 'articulos',
    });
    const pedidos = await servicio.buscarPedidos({
      pagina: 1, cantidadPorPagina: 25, vista: 'pedido',
    });

    expect(articulos.pedidos).toHaveLength(25);
    expect(articulos.pedidos.every((registro) => registro.articulos.length === 1)).toBe(true);
    expect(articulos.hayMas).toBe(true);
    expect(pedidos.pedidos).toHaveLength(1);
    expect(pedidos.pedidos[0]?.articulos).toHaveLength(30);
  });
});
