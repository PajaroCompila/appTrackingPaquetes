import type { NextFunction, Request, Response } from 'express';
import type { RespuestaAlmacenes } from './almacen.interface.js';
import type { AlmacenServicio } from './almacenServicio.js';

export class AlmacenControlador {
  public constructor(private readonly almacenServicio: AlmacenServicio) {}

  public obtenerAlmacenes = async (
    _solicitud: Request,
    respuesta: Response<RespuestaAlmacenes>,
    siguiente: NextFunction,
  ): Promise<void> => {
    try {
      const almacenes = await this.almacenServicio.obtenerAlmacenes();
      respuesta.json({ datos: almacenes });
    } catch (error) {
      siguiente(error);
    }
  };
}

