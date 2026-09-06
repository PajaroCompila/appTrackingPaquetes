import type { Request, Response } from "express";
import type { Configuracion } from "../configuracion/entorno.js";
import { NOMBRE_COOKIE } from "../middlewares/autenticacion.js";
import type { ServicioSesion } from "../servicios/sesion.servicio.js";
import type { ServicioUsuarios } from "../servicios/usuarios.servicio.js";
import { inicioSesionEsquema } from "../validaciones/usuario.validacion.js";
export class ControladorAutenticacion {
  constructor(
    private usuarios: ServicioUsuarios,
    private sesion: ServicioSesion,
    private configuracion: Configuracion,
  ) {}
  iniciar = async (solicitud: Request, respuesta: Response): Promise<void> => {
    const entrada = inicioSesionEsquema.parse(solicitud.body);
    const identidad = await this.usuarios.iniciarSesion(
      entrada.nombreUsuario,
      entrada.contrasena,
    );
    respuesta.cookie(NOMBRE_COOKIE, this.sesion.crearToken(identidad), {
      httpOnly: true,
      secure: this.configuracion.produccion,
      sameSite: "strict",
      maxAge: 8 * 60 * 60 * 1000,
      path: "/",
    });
    respuesta.json({ usuario: identidad });
  };
  actual = async (solicitud: Request, respuesta: Response): Promise<void> => {
    respuesta.json({ usuario: await this.usuarios.obtenerIdentidadActual(solicitud.identidad!) });
  };
  cerrar = (_solicitud: Request, respuesta: Response): void => {
    respuesta.clearCookie(NOMBRE_COOKIE, {
      httpOnly: true,
      secure: this.configuracion.produccion,
      sameSite: "strict",
      path: "/",
    });
    respuesta.status(204).end();
  };
}
