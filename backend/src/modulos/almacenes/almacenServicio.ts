import { ErrorAplicacion } from '../../compartido/errores/errorAplicacion.js';
import type { Almacen } from './almacen.interface.js';
import type { IAlmacenRepositorio } from './almacenRepositorio.js';

export class AlmacenServicio {
  public constructor(private readonly almacenRepositorio: IAlmacenRepositorio) {}

  public async obtenerAlmacenes(): Promise<Almacen[]> {
    try {
      return await this.almacenRepositorio.obtenerAlmacenes();
    } catch {
      throw new ErrorAplicacion(
        500,
        'ERROR_CONSULTA_ALMACENES',
        'No fue posible consultar los almacenes.',
      );
    }
  }
}

