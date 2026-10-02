import type { NextFunction, Request, Response } from 'express';
import { ErrorAplicacion } from '../../compartido/errores/errorAplicacion.js';
import type { CoincidenciaInventarioArticulo, InventarioArticulo } from './inventarioArticulo.interface.js';
import type { InventarioArticuloRepositorio } from './inventarioArticuloRepositorio.js';
import { esquemaBusquedaInventario, esquemaCodigoArticulo, esquemaConsultaInventario } from './inventarioArticuloValidacion.js';
export class InventarioArticuloControlador {
  public constructor(private readonly repositorio: InventarioArticuloRepositorio) {}

  public buscar = async (
    solicitud: Request,
    respuesta: Response<{ datos: CoincidenciaInventarioArticulo[] }>,
    siguiente: NextFunction,
  ): Promise<void> => {
    const consulta = esquemaBusquedaInventario.safeParse(solicitud.query);
    if (!consulta.success) {
      siguiente(new ErrorAplicacion(400, 'BUSQUEDA_INVENTARIO_INVALIDA',
        'Escriba al menos dos caracteres para buscar.'));
      return;
    }
    try {
      respuesta.json({ datos: await this.repositorio.buscar(
        consulta.data.termino, consulta.data.limite,
      ) });
    } catch {
      siguiente(new ErrorAplicacion(500, 'ERROR_BUSQUEDA_INVENTARIO',
        'No fue posible buscar artículos en SAP.'));
    }
  };

  public obtener = async (
    solicitud: Request<{ codigoArticulo: string }>,
    respuesta: Response<InventarioArticulo>,
    siguiente: NextFunction,
  ): Promise<void> => {
    const articulo = esquemaCodigoArticulo.safeParse(solicitud.params.codigoArticulo);
    const consulta = esquemaConsultaInventario.safeParse(solicitud.query);
    if (!articulo.success || !consulta.success) {
      siguiente(new ErrorAplicacion(400, 'PARAMETROS_INVENTARIO_INVALIDOS', 'Los parámetros proporcionados no son válidos.'));
      return;
    }

    try {
      const codigoAlmacen = consulta.data.codigoAlmacen;
      const inventario = await this.repositorio.obtener(articulo.data, codigoAlmacen);
      if (!inventario) {
        siguiente(new ErrorAplicacion(404, 'INVENTARIO_NO_ENCONTRADO', 'No se encontró inventario para el artículo y almacén indicados.'));
        return;
      }
      respuesta.json(inventario);
    } catch (error) {
      if (error instanceof ErrorAplicacion) {
        siguiente(error);
        return;
      }
      siguiente(new ErrorAplicacion(500, 'ERROR_CONSULTA_INVENTARIO', 'No fue posible consultar la existencia del artículo en SAP.'));
    }
  };
}

