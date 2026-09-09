import type { ConfiguracionSucursalR1 } from '../../configuracion/configuracionBaseDatos.js';
import { ErrorDependenciaDatos } from '../../compartido/errores/errorDependenciaDatos.js';
import { obtenerPoolSucursalR1, obtenerSucursalesR1 } from '../../infraestructura/sql/conexionSucursalesR1.js';
import type { DetallePedido, FiltrosPedidos, PaginaPedidos } from './pedido.interface.js';
import { PedidoRepositorio, type IPedidoRepositorio } from './pedidoRepositorio.js';

interface EstadoConsultaSucursal {
  resultado?: PaginaPedidos;
  actualizacion?: Promise<void>;
}

async function esperarActualizaciones(promesas: Promise<void>[], tiempoMaximoMs: number): Promise<void> {
  let temporizador: NodeJS.Timeout | undefined;
  const tiempoAgotado = new Promise<void>((resolver) => {
    temporizador = setTimeout(resolver, tiempoMaximoMs);
  });
  await Promise.race([Promise.allSettled(promesas).then(() => undefined), tiempoAgotado]);
  if (temporizador) clearTimeout(temporizador);
}

export class PedidoSucursalesRepositorio implements IPedidoRepositorio {
  private readonly estadosConsulta = new Map<string, EstadoConsultaSucursal>();

  public constructor(
    private readonly sucursalesConfiguradas?: ConfiguracionSucursalR1[],
    private readonly crearRepositorio: (sucursal: ConfiguracionSucursalR1) => Promise<IPedidoRepositorio>
      = async (sucursal) => {
        const pool = await obtenerPoolSucursalR1(sucursal);
        return new PedidoRepositorio(() => pool, sucursal.codigoTienda);
      },
    private readonly tiempoMaximoRespuestaMs = 350,
  ) {}

  private sucursales(): ConfiguracionSucursalR1[] {
    return this.sucursalesConfiguradas ?? obtenerSucursalesR1();
  }

  public async buscarPedidos(filtros: FiltrosPedidos): Promise<PaginaPedidos> {
    const cantidadAcumulada = filtros.pagina * filtros.cantidadPorPagina;
    const consulta = { ...filtros, pagina: 1, cantidadPorPagina: cantidadAcumulada };
    const estados = this.sucursales().map((sucursal) =>
      this.obtenerEstadoConsulta(sucursal, consulta));
    await esperarActualizaciones(
      estados.map(({ sucursal, estado }) => this.actualizarSucursal(sucursal, consulta, estado)),
      this.tiempoMaximoRespuestaMs,
    );
    const disponibles = estados.flatMap(({ estado }) => estado.resultado ? [estado.resultado] : []);
    if (disponibles.length === 0) throw new ErrorDependenciaDatos();
    const pedidos = disponibles.flatMap((resultado) => resultado.pedidos)
      .sort((a, b) => (a.fechaHoraPedido ?? '\uffff').localeCompare(b.fechaHoraPedido ?? '\uffff')
        || a.idOrigen.localeCompare(b.idOrigen))
      .slice(0, cantidadAcumulada);
    const totalRegistros = disponibles.reduce((total, resultado) => total + resultado.totalRegistros, 0);
    return { pedidos, pagina: 1, cantidadPorPagina: cantidadAcumulada, totalRegistros,
      hayMas: pedidos.length < totalRegistros };
  }

  private obtenerEstadoConsulta(
    sucursal: ConfiguracionSucursalR1,
    filtros: FiltrosPedidos,
  ): { sucursal: ConfiguracionSucursalR1; estado: EstadoConsultaSucursal } {
    const clave = JSON.stringify({
      tienda: sucursal.codigoTienda,
      numeroPedido: filtros.numeroPedido ?? null,
      fechaDesde: filtros.fechaDesde ?? null,
      fechaHasta: filtros.fechaHasta ?? null,
      codigosAlmacen: [...(filtros.codigosAlmacen ?? [])].sort(),
      codigoEstadoVenta: filtros.codigoEstadoVenta ?? null,
      codigoSincronizacion: filtros.codigoSincronizacion ?? null,
      pagina: filtros.pagina,
      cantidadPorPagina: filtros.cantidadPorPagina,
    });
    let estado = this.estadosConsulta.get(clave);
    if (!estado) {
      if (this.estadosConsulta.size >= 120) {
        const primeraClave = this.estadosConsulta.keys().next().value as string | undefined;
        if (primeraClave) this.estadosConsulta.delete(primeraClave);
      }
      estado = {};
      this.estadosConsulta.set(clave, estado);
    }
    return { sucursal, estado };
  }

  private actualizarSucursal(
    sucursal: ConfiguracionSucursalR1,
    filtros: FiltrosPedidos,
    estado: EstadoConsultaSucursal,
  ): Promise<void> {
    if (estado.actualizacion) return estado.actualizacion;
    const actualizacion = this.crearRepositorio(sucursal)
      .then((repositorio) => repositorio.buscarPedidos(filtros))
      .then((resultado) => {
        estado.resultado = resultado;
      })
      .catch(() => {
        estado.resultado = undefined;
      })
      .finally(() => {
        estado.actualizacion = undefined;
      });
    estado.actualizacion = actualizacion;
    return actualizacion;
  }

  public async obtenerDetallePedido(identificador: string, codigosAlmacen: string[] = []): Promise<DetallePedido | null> {
    const separador = identificador.indexOf(':');
    const codigoFuente = separador > 0 ? identificador.slice(0, separador) : 'TSPS01';
    const folioPedido = separador > 0 ? identificador.slice(separador + 1) : identificador;
    const sucursal = this.sucursales().find((item) => item.codigoTienda === codigoFuente);
    if (!sucursal) return null;
    return (await this.crearRepositorio(sucursal)).obtenerDetallePedido(folioPedido, codigosAlmacen);
  }
}
