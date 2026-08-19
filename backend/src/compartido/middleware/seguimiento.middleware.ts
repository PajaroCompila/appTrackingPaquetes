import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export function asignarIdSeguimiento(
  solicitud: Request,
  respuesta: Response,
  siguiente: NextFunction,
): void {
  const idSeguimiento = randomUUID();
  respuesta.locals['idSeguimiento'] = idSeguimiento;
  respuesta.setHeader('x-id-seguimiento', idSeguimiento);
  solicitud.id = idSeguimiento;
  siguiente();
}

