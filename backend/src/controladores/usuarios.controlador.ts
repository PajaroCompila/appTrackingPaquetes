import type { Request, Response } from "express";
import type { ServicioUsuarios } from "../servicios/usuarios.servicio.js";
import { ErrorAplicacion } from "../utilidades/errorAplicacion.js";
import {
  actualizacionUsuarioEsquema,
  registroUsuarioEsquema,
} from "../validaciones/usuario.validacion.js";
export class ControladorUsuarios {
  constructor(private usuarios: ServicioUsuarios) {}
  listar = async (solicitud: Request, respuesta: Response): Promise<void> => {
    if (!solicitud.identidad)
      throw new ErrorAplicacion(
        401,
        "SESION_REQUERIDA",
        "Debes iniciar sesión",
      );
    respuesta.json(await this.usuarios.listar(solicitud.identidad));
  };
  crear = async (solicitud: Request, respuesta: Response): Promise<void> => {
    if (!solicitud.identidad)
      throw new ErrorAplicacion(
        401,
        "SESION_REQUERIDA",
        "Debes iniciar sesión",
      );
    const registro = registroUsuarioEsquema.parse(solicitud.body);
    const resultado = await this.usuarios.crear(solicitud.identidad, registro);
    respuesta.status(201).json(resultado);
  };
  actualizar = async (
    solicitud: Request,
    respuesta: Response,
  ): Promise<void> => {
    if (!solicitud.identidad)
      throw new ErrorAplicacion(
        401,
        "SESION_REQUERIDA",
        "Debes iniciar sesión",
      );
    const usuarioId = Number(solicitud.params.usuarioId);
    if (!Number.isInteger(usuarioId) || usuarioId < 1)
      throw new ErrorAplicacion(
        400,
        "USUARIO_INVALIDO",
        "El identificador no es válido",
      );
    const cambios = actualizacionUsuarioEsquema.parse(solicitud.body);
    respuesta.json(
      await this.usuarios.actualizar(solicitud.identidad, usuarioId, cambios),
    );
  };
}
