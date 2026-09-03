import { ErrorAplicacion } from '../../compartido/errores/errorAplicacion.js';
import { ErrorDependenciaDatos } from '../../compartido/errores/errorDependenciaDatos.js';
import type {
  DetallePedido,
  FiltrosPedidos,
  PaginaPedidos,
} from './pedido.interface.js';
import type { IPedidoRepositorio } from './pedidoRepositorio.js';
import { PedidoSapRepositorio, type IPedidoSapRepositorio } from './pedidoSapRepositorio.js';
import type { IDespachoRepositorio } from '../despachos/despachoRepositorio.js';
import { claveLineaDespachada } from '../despachos/despachoRepositorio.js';

export class PedidoServicio {
  public constructor(
    private readonly pedidoRepositorio: IPedidoRepositorio,
    private readonly pedidoSapRepositorio: IPedidoSapRepositorio = new PedidoSapRepositorio(),
    private readonly despachoRepositorio?: IDespachoRepositorio,
  ) {}

  public async buscarPedidos(filtros: FiltrosPedidos): Promise<PaginaPedidos> {
    try {
      const cantidadAcumulada = filtros.pagina * filtros.cantidadPorPagina;
      const filtrosAcumulados = { ...filtros, pagina: 1, cantidadPorPagina: cantidadAcumulada };
      const [resultadoRetailOne, resultadoSap] = await Promise.allSettled([
        this.pedidoRepositorio.buscarPedidos(filtrosAcumulados),
        this.pedidoSapRepositorio.buscarPedidos(filtrosAcumulados),
      ]);
      const retailOne = resultadoRetailOne.status === 'fulfilled' ? resultadoRetailOne.value : null;
      const sap = resultadoSap.status === 'fulfilled' ? resultadoSap.value : null;
      if (!retailOne && !sap) {
        throw new ErrorDependenciaDatos();
      }
      if (!retailOne) console.warn('La fuente RetailOne no estuvo disponible durante la consulta.');
      if (!sap) console.warn('La fuente SAP no estuvo disponible durante la consulta.');
      const lineasDespachadas = this.despachoRepositorio
        ? await this.despachoRepositorio.identidadesLineas()
        : new Set<string>();
      const unificados = [...(retailOne?.pedidos ?? []), ...(sap?.pedidos ?? [])]
        .map((pedido) => ({ ...pedido, articulos: pedido.articulos.filter((articulo) => {
          const identidad = articulo.identificadorDetalle?.trim();
          return identidad
            && !lineasDespachadas.has(claveLineaDespachada(pedido.idOrigen, '*'))
            && !lineasDespachadas.has(claveLineaDespachada(pedido.idOrigen, identidad));
        }) }))
        .filter((pedido) => pedido.articulos.length > 0).sort((a, b) =>
        (a.fechaHoraPedido ?? '\uffff').localeCompare(b.fechaHoraPedido ?? '\uffff') || a.idOrigen.localeCompare(b.idOrigen));
      const inicio = (filtros.pagina - 1) * filtros.cantidadPorPagina;
      const pedidos = unificados.slice(inicio, inicio + filtros.cantidadPorPagina);
      const totalRegistros = unificados.length;
      return { pedidos, pagina: filtros.pagina, cantidadPorPagina: filtros.cantidadPorPagina,
        totalRegistros, hayMas: inicio + pedidos.length < totalRegistros,
        fuentes: {
          retailOne: retailOne ? 'disponible' : 'no_disponible',
          sap: sap ? 'disponible' : 'no_disponible',
        } };
    } catch (error) {
      this.procesarErrorRepositorio(error, 'No fue posible consultar los pedidos.');
    }
  }

  public async obtenerDetallePedido(
    folioPedido: string,
    codigosAlmacen: string[] = [],
  ): Promise<DetallePedido> {
    try {
      const esSap = folioPedido.startsWith('SAP:');
      const identificador = folioPedido.replace(/^(?:SAP|R1):/, '');
      const pedido = esSap
        ? await this.pedidoSapRepositorio.obtenerDetallePedido(identificador, codigosAlmacen)
        : await this.pedidoRepositorio.obtenerDetallePedido(identificador, codigosAlmacen);
      if (!pedido) {
        throw new ErrorAplicacion(404, 'PEDIDO_NO_ENCONTRADO', 'El pedido solicitado no existe.');
      }
      return pedido;
    } catch (error) {
      if (error instanceof ErrorAplicacion) {
        throw error;
      }
      this.procesarErrorRepositorio(error, 'No fue posible consultar el pedido.');
    }
  }

  private procesarErrorRepositorio(error: unknown, mensaje: string): never {
    if (error instanceof ErrorDependenciaDatos) {
      throw new ErrorAplicacion(503, 'SISTEMA_ORIGEN_NO_DISPONIBLE', 'SistemaOrigen no está disponible temporalmente.');
    }
    throw new ErrorAplicacion(500, 'ERROR_CONSULTA_PEDIDOS', mensaje);
  }
}
