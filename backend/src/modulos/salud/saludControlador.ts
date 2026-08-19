import type { Request, Response } from 'express';
import type { RespuestaSalud } from './salud.interface.js';
import { SaludServicio } from './saludServicio.js';

export class SaludControlador {
  public constructor(private readonly saludServicio: SaludServicio) {}

  public obtenerEstado = (
    _solicitud: Request,
    respuesta: Response<RespuestaSalud>,
  ): void => {
    respuesta.json({ datos: this.saludServicio.obtenerEstado() });
  };
}

