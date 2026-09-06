import type { Request, Response } from "express";
import type { ServicioSucursales } from "../servicios/sucursales.servicio.js";
import { ErrorAplicacion } from "../utilidades/errorAplicacion.js";
import { datosSucursalEsquema } from "../validaciones/sucursal.validacion.js";

export class ControladorSucursales {
  constructor(private readonly sucursales: ServicioSucursales) {}

  listar = async (_solicitud: Request, respuesta: Response): Promise<void> => {
    respuesta.json(await this.sucursales.listar());
  };

  listarUbicaciones = async (_solicitud: Request, respuesta: Response): Promise<void> => {
    respuesta.json(await this.sucursales.listarUbicaciones());
  };

  crear = async (solicitud: Request, respuesta: Response): Promise<void> => {
    this.exigirAdministrador(solicitud);
    respuesta.status(201).json(await this.sucursales.crear(datosSucursalEsquema.parse(solicitud.body)));
  };

  actualizar = async (solicitud: Request, respuesta: Response): Promise<void> => {
    this.exigirAdministrador(solicitud);
    const sucursalId = Number(solicitud.params.sucursalId);
    if (!Number.isInteger(sucursalId) || sucursalId < 1) throw new ErrorAplicacion(400, "SUCURSAL_INVALIDA", "El identificador no es válido");
    respuesta.json(await this.sucursales.actualizar(sucursalId, datosSucursalEsquema.parse(solicitud.body)));
  };

  private exigirAdministrador(solicitud: Request): void {
    if (solicitud.identidad?.rol !== "administrador") throw new ErrorAplicacion(403, "ACCESO_DENEGADO", "Solo un administrador puede administrar sucursales");
  }
}
