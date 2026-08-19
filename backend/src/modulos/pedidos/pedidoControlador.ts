import type { NextFunction, Request, Response } from 'express';
import { ErrorAplicacion } from '../../compartido/errores/errorAplicacion.js';
import type {
  RespuestaDetallePedido,
  RespuestaListaPedidos,
} from './pedido.interface.js';
import type { PedidoServicio } from './pedidoServicio.js';
import {
  esquemaFiltroDetallePedido,
  esquemaFiltrosPedidos,
  esquemaFolioPedido,
} from './pedidoValidacion.js';

export class PedidoControlador {
  public constructor(private readonly pedidoServicio: PedidoServicio) {}

  public buscarPedidos = async (
    solicitud: Request,
    respuesta: Response<RespuestaListaPedidos>,
    siguiente: NextFunction,
  ): Promise<void> => {
    const resultadoValidacion = esquemaFiltrosPedidos.safeParse(solicitud.query);
    if (!resultadoValidacion.success) {
      siguiente(new ErrorAplicacion(400, 'FILTROS_INVALIDOS', 'Los filtros proporcionados no son válidos.'));
      return;
    }

    try {
      const paginaPedidos = await this.pedidoServicio.buscarPedidos(resultadoValidacion.data);
      respuesta.json({
        datos: paginaPedidos.pedidos,
        paginacion: {
          pagina: paginaPedidos.pagina,
          cantidadPorPagina: paginaPedidos.cantidadPorPagina,
          cantidadDevuelta: paginaPedidos.pedidos.length,
          totalRegistros: paginaPedidos.totalRegistros,
          hayMas: paginaPedidos.hayMas,
        },
        fuentes: paginaPedidos.fuentes,
      });
    } catch (error) {
      siguiente(error);
    }
  };

  public obtenerDetallePedido = async (
    solicitud: Request<{ folioPedido: string }>,
    respuesta: Response<RespuestaDetallePedido>,
    siguiente: NextFunction,
  ): Promise<void> => {
    const resultadoValidacion = esquemaFolioPedido.safeParse(solicitud.params.folioPedido);
    const resultadoFiltros = esquemaFiltroDetallePedido.safeParse(solicitud.query);
    if (!resultadoValidacion.success || !resultadoFiltros.success) {
      siguiente(new ErrorAplicacion(400, 'FOLIO_INVALIDO', 'El folio proporcionado no es válido.'));
      return;
    }

    try {
      const pedido = await this.pedidoServicio.obtenerDetallePedido(
        resultadoValidacion.data,
        resultadoFiltros.data.codigosAlmacen,
      );
      respuesta.json({ datos: pedido });
    } catch (error) {
      siguiente(error);
    }
  };
}
