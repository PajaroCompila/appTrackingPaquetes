import type { NextFunction, Request, Response } from "express";
import type { ServicioSesion } from "../servicios/sesion.servicio.js";
import { ErrorAplicacion } from "../utilidades/errorAplicacion.js";
export const NOMBRE_COOKIE = "sesionTracking";
export function autenticar(sesion: ServicioSesion) {
  return (
    solicitud: Request,
    _respuesta: Response,
    siguiente: NextFunction,
  ): void => {
    const token = solicitud.cookies[NOMBRE_COOKIE] as string | undefined;
    if (!token)
      return siguiente(
        new ErrorAplicacion(401, "SESION_REQUERIDA", "Debes iniciar sesión"),
      );
    try {
      solicitud.identidad = sesion.validarToken(token);
      siguiente();
    } catch (error) {
      siguiente(error);
    }
  };
}
export function exigirOrigen(origenPermitido: string) {
  return (
    solicitud: Request,
    _respuesta: Response,
    siguiente: NextFunction,
  ): void => {
    if (
      solicitud.method !== "GET" &&
      solicitud.get("origin") !== origenPermitido
    )
      return siguiente(
        new ErrorAplicacion(
          403,
          "ORIGEN_NO_PERMITIDO",
          "La solicitud no está permitida",
        ),
      );
    siguiente();
  };
}
