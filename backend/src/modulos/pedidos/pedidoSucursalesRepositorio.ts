import type { ConfiguracionSucursalR1 } from '../../configuracion/configuracionBaseDatos.js';
import { obtenerPoolSucursalR1, obtenerSucursalesR1 } from '../../infraestructura/sql/conexionSucursalesR1.js';
import type { DetallePedido, FiltrosPedidos, PaginaPedidos } from './pedido.interface.js';
import { PedidoRepositorio, type IPedidoRepositorio } from './pedidoRepositorio.js';

export class PedidoSucursalesRepositorio implements IPedidoRepositorio {
  public constructor(
    private readonly sucursalesConfiguradas?: ConfiguracionSucursalR1[],
    private readonly crearRepositorio: (sucursal: ConfiguracionSucursalR1) => Promise<IPedidoRepositorio>
      = async (sucursal) => {
        const pool = await obtenerPoolSucursalR1(sucursal);
        return new PedidoRepositorio(() => pool, sucursal.codigoTienda);
      },
  ) {}

  private sucursales(): ConfiguracionSucursalR1[] {
    return this.sucursalesConfiguradas ?? obtenerSucursalesR1();
  }

  public async buscarPedidos(filtros: FiltrosPedidos): Promise<PaginaPedidos> {
    const cantidadAcumulada = filtros.pagina * filtros.cantidadPorPagina;
    const consulta = { ...filtros, pagina: 1, cantidadPorPagina: cantidadAcumulada };
    const resultados = await Promise.allSettled(this.sucursales().map(async (sucursal) =>
      (await this.crearRepositorio(sucursal)).buscarPedidos(consulta)));
    const disponibles = resultados.filter((resultado) => resultado.status === 'fulfilled');
    if (disponibles.length === 0) throw resultados[0]?.status === 'rejected'
      ? resultados[0].reason : new Error('No hay sucursales configuradas.');
    const pedidos = disponibles.flatMap((resultado) => resultado.value.pedidos)
      .sort((a, b) => (a.fechaHoraPedido ?? '\uffff').localeCompare(b.fechaHoraPedido ?? '\uffff')
        || a.idOrigen.localeCompare(b.idOrigen))
      .slice(0, cantidadAcumulada);
    const totalRegistros = disponibles.reduce((total, resultado) => total + resultado.value.totalRegistros, 0);
    return { pedidos, pagina: 1, cantidadPorPagina: cantidadAcumulada, totalRegistros,
      hayMas: pedidos.length < totalRegistros };
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
