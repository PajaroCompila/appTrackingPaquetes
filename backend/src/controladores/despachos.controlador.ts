import type { Request, Response } from 'express';
import { z } from 'zod';
import type { RepositorioDespachosSql } from '../repositorios/despachos.repositorio.js';
import { ErrorAplicacion } from '../utilidades/errorAplicacion.js';

const esquema = z.object({
  placa: z.string().trim().min(5).max(15).regex(/^[A-Za-z0-9 -]+$/),
  conductor: z.string().trim().min(3).max(120),
  puntoDestinoId: z.number().int().positive(),
  envioIds: z.array(z.number().int().positive()).min(1).max(100),
});

export class ControladorDespachos {
  constructor(private readonly repositorio: RepositorioDespachosSql) {}

  listar = async (solicitud: Request, respuesta: Response) => {
    respuesta.json(await this.repositorio.listar(solicitud.identidad!));
  };

  listarPaquetesDisponibles = async (solicitud: Request, respuesta: Response) => {
    respuesta.json(await this.repositorio.listarPaquetesDisponibles(solicitud.identidad!.usuarioId));
  };

  crear = async (solicitud: Request, respuesta: Response) => {
    const datos = esquema.parse(solicitud.body);
    const creado = await this.repositorio.crear(solicitud.identidad!, {
      ...datos,
      placa: datos.placa.toUpperCase(),
    });
    if (!creado) {
      throw new ErrorAplicacion(400, 'DESPACHO_INVALIDO', 'Verifica las guías y la sucursal de destino');
    }
    respuesta.status(201).json(creado);
  };
}
