import type { NextFunction, Request, Response } from 'express';
import { ErrorAplicacion } from '../../compartido/errores/errorAplicacion.js';
import { AutenticacionServicio } from './autenticacionServicio.js';

export const nombreCookieSesion = 'pb_sesion';
const servicio = new AutenticacionServicio();

export async function requerirAutenticacion(
  solicitud: Request,
  _respuesta: Response,
  siguiente: NextFunction,
): Promise<void> {
  try {
    const token = solicitud.cookies?.[nombreCookieSesion];
    if (typeof token !== 'string' || !token) {
      throw new ErrorAplicacion(401, 'SESION_REQUERIDA', 'DebÃ©s iniciar sesiÃ³n.');
    }
    solicitud.user = await servicio.validarToken(token);
    siguiente();
  } catch (error) {
    siguiente(error);
  }
}

export function requerirRoles(...roles: string[]) {
  return (solicitud: Request, _respuesta: Response, siguiente: NextFunction): void => {
    if (!solicitud.user?.codigoRol || !roles.includes(solicitud.user.codigoRol)) {
      siguiente(new ErrorAplicacion(403, 'PERMISO_REQUERIDO',
        'No tenés permiso para realizar esta acción.'));
      return;
    }
    siguiente();
  };
}

export function requerirContrasenaActualizada(
  solicitud: Request, _respuesta: Response, siguiente: NextFunction,
): void {
  if (solicitud.user?.debeCambiarContrasena) {
    siguiente(new ErrorAplicacion(403, 'CAMBIO_CONTRASENA_REQUERIDO',
      'Debés cambiar tu contraseña antes de continuar.'));
    return;
  }
  siguiente();
}
