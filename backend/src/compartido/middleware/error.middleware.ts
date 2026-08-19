import type { NextFunction, Request, Response } from 'express';
import { ErrorAplicacion } from '../errores/errorAplicacion.js';

interface RespuestaError {
  codigo: string;
  mensaje: string;
  idSeguimiento: string;
}

export function manejarRutaNoEncontrada(
  _solicitud: Request,
  _respuesta: Response,
  siguiente: NextFunction,
): void {
  siguiente(new ErrorAplicacion(404, 'RUTA_NO_ENCONTRADA', 'La ruta solicitada no existe.'));
}

export function manejarError(
  error: unknown,
  solicitud: Request,
  respuesta: Response<RespuestaError>,
  _siguiente: NextFunction,
): void {
  void _siguiente;
  const errorAplicacion =
    error instanceof ErrorAplicacion
      ? error
      : new ErrorAplicacion(500, 'ERROR_INTERNO', 'Ocurrió un error inesperado.');

  solicitud.log.error(
    { error: error instanceof Error ? error : new Error('Error no identificable') },
    'Solicitud terminada con error',
  );

  respuesta.status(errorAplicacion.estadoHttp).json({
    codigo: errorAplicacion.codigo,
    mensaje: errorAplicacion.message,
    idSeguimiento: String(solicitud.id),
  });
}
