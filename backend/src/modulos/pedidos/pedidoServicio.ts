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
import type { SeguimientoPedidoRepositorio } from './seguimientoPedidoRepositorio.js';

interface EstadoCacheSap {
  resultado?: PaginaPedidos;
  actualizacion?: Promise<PaginaPedidos | null>;
}

export class PedidoServicio {
  private readonly cacheSap = new Map<string, EstadoCacheSap>();

  public constructor(
    private readonly pedidoRepositorio: IPedidoRepositorio,
    private readonly pedidoSapRepositorio: IPedidoSapRepositorio = new PedidoSapRepositorio(),
    private readonly despachoRepositorio?: IDespachoRepositorio,
    private readonly seguimientoRepositorio?: SeguimientoPedidoRepositorio,
  ) {}

  public async buscarPedidos(filtros: FiltrosPedidos): Promise<PaginaPedidos> {
    try {
      const cantidadAcumulada = filtros.pagina * filtros.cantidadPorPagina;
      const filtrosAcumulados = { ...filtros, pagina: 1, cantidadPorPagina: cantidadAcumulada };
      const claveCacheSap = this.crearClaveCacheSap(filtrosAcumulados);
      const estadoCacheSap = this.obtenerEstadoCacheSap(claveCacheSap);
      const sapAnterior = estadoCacheSap.resultado ?? null;
      const actualizacionSap = this.actualizarSapEnSegundoPlano(
        claveCacheSap,
        filtrosAcumulados,
        estadoCacheSap,
      );

      let retailOne: PaginaPedidos | null = null;
      try {
        retailOne = await this.pedidoRepositorio.buscarPedidos(filtrosAcumulados);
      } catch {
        console.warn('La fuente RetailOne no estuvo disponible durante la consulta.');
      }

      const sap = sapAnterior ?? (retailOne ? null : await actualizacionSap);
      if (!retailOne && !sap) {
        throw new ErrorDependenciaDatos();
      }
      const lineasDespachadas = this.despachoRepositorio
        ? await this.despachoRepositorio.identidadesLineas()
        : new Set<string>();
      const pedidosOrigen = [...(retailOne?.pedidos ?? []), ...(sap?.pedidos ?? [])];
      if (this.seguimientoRepositorio) {
        await this.seguimientoRepositorio.registrarYAplicar(
          pedidosOrigen,
          (filtrosAcumulados.codigosAlmacen?.length ?? 0) === 0,
        );
      }
      const unificados = pedidosOrigen
        .map((pedido) => ({ ...pedido, articulos: pedido.articulos.filter((articulo) => {
          const identidad = articulo.identificadorDetalle?.trim();
          return identidad
            && !lineasDespachadas.has(claveLineaDespachada(pedido.idOrigen, '*'))
            && !lineasDespachadas.has(claveLineaDespachada(pedido.idOrigen, identidad));
        }) }))
        .filter((pedido) => pedido.articulos.length > 0).sort((a, b) =>
        (a.fechaHoraPedido ?? '\uffff').localeCompare(b.fechaHoraPedido ?? '\uffff') || a.idOrigen.localeCompare(b.idOrigen));
      const registros = filtros.vista === 'pedido'
        ? unificados
        : unificados.flatMap((pedido) => pedido.articulos.map((articulo) => ({
          ...pedido,
          codigosAlmacen: articulo.codigoAlmacen ? [articulo.codigoAlmacen] : [],
          nombresBodega: articulo.nombreAlmacen,
          articulos: [articulo],
        })));
      const inicio = (filtros.pagina - 1) * filtros.cantidadPorPagina;
      const pedidos = registros.slice(inicio, inicio + filtros.cantidadPorPagina);
      const totalRegistros = registros.length;
      return { pedidos, pagina: filtros.pagina, cantidadPorPagina: filtros.cantidadPorPagina,
        totalRegistros, hayMas: Boolean(retailOne?.hayMas || sap?.hayMas
          || inicio + pedidos.length < totalRegistros),
        fuentes: {
          retailOne: retailOne ? 'disponible' : 'no_disponible',
          sap: sap ? 'disponible' : 'no_disponible',
        } };
    } catch (error) {
      this.procesarErrorRepositorio(error, 'No fue posible consultar los pedidos.');
    }
  }

  private crearClaveCacheSap(filtros: FiltrosPedidos): string {
    return JSON.stringify({
      numeroPedido: filtros.numeroPedido ?? null,
      fechaDesde: filtros.fechaDesde ?? null,
      fechaHasta: filtros.fechaHasta ?? null,
      codigosAlmacen: [...(filtros.codigosAlmacen ?? [])].sort(),
      codigoEstadoVenta: filtros.codigoEstadoVenta ?? null,
      codigoSincronizacion: filtros.codigoSincronizacion ?? null,
      vista: filtros.vista ?? 'articulos',
      pagina: filtros.pagina,
      cantidadPorPagina: filtros.cantidadPorPagina,
    });
  }

  private obtenerEstadoCacheSap(clave: string): EstadoCacheSap {
    const existente = this.cacheSap.get(clave);
    if (existente) return existente;

    if (this.cacheSap.size >= 100) {
      const primeraClave = this.cacheSap.keys().next().value as string | undefined;
      if (primeraClave) this.cacheSap.delete(primeraClave);
    }
    const nuevo: EstadoCacheSap = {};
    this.cacheSap.set(clave, nuevo);
    return nuevo;
  }

  private actualizarSapEnSegundoPlano(
    clave: string,
    filtros: FiltrosPedidos,
    estado: EstadoCacheSap,
  ): Promise<PaginaPedidos | null> {
    if (estado.actualizacion) return estado.actualizacion;

    const actualizacion = this.pedidoSapRepositorio.buscarPedidos(filtros)
      .then((resultado) => {
        estado.resultado = resultado;
        return resultado;
      })
      .catch(() => {
        estado.resultado = undefined;
        console.warn('La fuente SAP no estuvo disponible durante la consulta en segundo plano.');
        return null;
      })
      .finally(() => {
        estado.actualizacion = undefined;
        this.cacheSap.set(clave, estado);
      });
    estado.actualizacion = actualizacion;
    return actualizacion;
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
      if (this.seguimientoRepositorio) await this.seguimientoRepositorio.aplicar([pedido.cabecera]);
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
