import type { Request, Response } from "express";
import type { ServicioEnvios } from "../servicios/envios.servicio.js";
import { actualizacionEnvioEsquema, datosEnvioEsquema, recepcionEnvioEsquema, recepcionLoteEsquema } from "../validaciones/envio.validacion.js";

export class ControladorEnvios {
  constructor(private readonly envios: ServicioEnvios) {}

  listar = async (solicitud: Request, respuesta: Response): Promise<void> => {
    respuesta.json(await this.envios.listar(solicitud.identidad!));
  };

  crear = async (solicitud: Request, respuesta: Response): Promise<void> => {
    const datos = datosEnvioEsquema.parse(solicitud.body);
    respuesta.status(201).json(await this.envios.crear(solicitud.identidad!, datos));
  };

  consultar = async (solicitud: Request, respuesta: Response): Promise<void> => {
    const parametro = solicitud.params["numeroGuia"];
    const numeroGuia = Array.isArray(parametro) ? parametro[0] ?? "" : parametro ?? "";
    respuesta.json(await this.envios.consultar(numeroGuia));
  };

  actualizar = async (solicitud: Request, respuesta: Response): Promise<void> => {
    const envioId = Number(solicitud.params["envioId"]);
    const datos = actualizacionEnvioEsquema.parse(solicitud.body);
    respuesta.json(await this.envios.actualizar(solicitud.identidad!, envioId, datos));
  };

  eliminar = async (solicitud: Request, respuesta: Response): Promise<void> => {
    const envioId = Number(solicitud.params["envioId"]);
    await this.envios.eliminar(solicitud.identidad!, envioId);
    respuesta.status(204).end();
  };
  listarRecepciones = async (_s:Request,r:Response) => { r.json(await this.envios.listarRecepciones()); };
  listarDisponiblesParaRecepcion = async (_s:Request,r:Response) => { r.json(await this.envios.listarDisponiblesParaRecepcion()); };
  listarRecibidos = async (s:Request,r:Response) => { r.json(await this.envios.listarRecibidos(s.identidad!.usuarioId)); };
  usuariosActivos = async (_s:Request,r:Response) => { r.json(await this.envios.usuariosActivos()); };
  registrarRecepcion = async (s:Request,r:Response) => { const datos=recepcionEnvioEsquema.parse(s.body); r.status(201).json(await this.envios.registrarRecepcion({ ...datos, usuarioRecibeId: s.identidad!.usuarioId })); };
  registrarRecepciones = async (s:Request,r:Response) => { const datos=recepcionLoteEsquema.parse(s.body);r.status(201).json(await this.envios.registrarRecepciones(datos.envioIds,s.identidad!.usuarioId)); };
}
