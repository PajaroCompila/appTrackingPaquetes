import { Router } from 'express';
import { z } from 'zod';
import { ImpresionRepositorio } from './impresionRepositorio.js';

export const impresionRutas = Router();
const repositorio = new ImpresionRepositorio();
const esquemaIdentidad = z.object({
  idOrigen: z.string().trim().min(1).max(150),
  identificadorDetalle: z.string().trim().min(1).max(150),
}).strict();
export const esquemaLineasImpresion = z.object({
  lineas: z.array(esquemaIdentidad).min(1).max(500),
}).strict();

impresionRutas.post('/consultar', async (solicitud, respuesta, siguiente) => {
  try {
    const { lineas } = esquemaLineasImpresion.parse(solicitud.body);
    respuesta.json({ datos: await repositorio.consultar(lineas) });
  } catch (error) {
    siguiente(error);
  }
});

impresionRutas.post('/registrar', async (solicitud, respuesta, siguiente) => {
  try {
    const { lineas } = esquemaLineasImpresion.parse(solicitud.body);
    respuesta.json({ datos: await repositorio.registrar(lineas, solicitud.user!.usuarioId) });
  } catch (error) {
    siguiente(error);
  }
});
