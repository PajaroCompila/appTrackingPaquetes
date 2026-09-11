import type { NextFunction, Request, Response } from 'express';
import { ErrorAplicacion } from '../../compartido/errores/errorAplicacion.js';
import type { InventarioArticulo } from './inventarioArticulo.interface.js';
import type { InventarioArticuloRepositorio } from './inventarioArticuloRepositorio.js';
import { esquemaCodigoArticulo, esquemaConsultaInventario } from './inventarioArticuloValidacion.js';
import { puedeVerAlmacen } from '../usuarios/accesoAlmacenes.js';
import type { IdentidadAutenticada } from '../autenticacion/autenticacion.interface.js';

export function puedeConsultarTodoElInventario(
  usuario: Pick<IdentidadAutenticada, 'nombreUsuario'> | undefined,
): boolean {
  return usuario?.nombreUsuario.trim().toLowerCase() === 'tlopez';
}

export class InventarioArticuloControlador {
  public constructor(private readonly repositorio: InventarioArticuloRepositorio) {}

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
      const consultaCompleta = puedeConsultarTodoElInventario(solicitud.user);
      if (!consultaCompleta && !puedeVerAlmacen(solicitud.user!, consulta.data.codigoAlmacen)) {
        siguiente(new ErrorAplicacion(404, 'INVENTARIO_NO_ENCONTRADO', 'No se encontró inventario para el artículo y almacén indicados.'));
        return;
      }
      const inventario = await this.repositorio.obtener(articulo.data, consulta.data.codigoAlmacen);
      if (!inventario) {
        siguiente(new ErrorAplicacion(404, 'INVENTARIO_NO_ENCONTRADO', 'No se encontró inventario para el artículo y almacén indicados.'));
        return;
      }
      if (!consultaCompleta && Array.isArray(inventario.existencias)) {
        inventario.existencias = inventario.existencias.filter(({ codigoAlmacen }) =>
          puedeVerAlmacen(solicitud.user!, codigoAlmacen));
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

