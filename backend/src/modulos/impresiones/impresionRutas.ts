import { Router } from 'express';
import { z } from 'zod';
import { ImpresionRepositorio } from './impresionRepositorio.js';
import { AsignacionRepositorio } from '../asignaciones/asignacionRepositorio.js';
import { ErrorAplicacion } from '../../compartido/errores/errorAplicacion.js';

export const impresionRutas = Router();
const repositorio = new ImpresionRepositorio();
const asignaciones = new AsignacionRepositorio();
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
    const usuario = solicitud.user!;
    const esSupervisor = usuario.codigoRol?.toUpperCase() === 'ADMINISTRADOR'
      || usuario.nombreUsuario.trim().toLowerCase() === 'gcruz';
    if (!esSupervisor) {
      const actuales = await asignaciones.consultar(lineas);
      const nombreUsuario = usuario.nombreUsuario.trim().toLowerCase();
      if (actuales.some(({ usuarioAsignado }) => usuarioAsignado
        && usuarioAsignado.trim().toLowerCase() !== nombreUsuario)) {
        throw new ErrorAplicacion(403, 'RESPONSABLE_NO_AUTORIZADO',
          'Solo la persona asignada puede registrar la impresión de esta partida.');
      }
    }
    respuesta.json({ datos: await repositorio.registrar(lineas, solicitud.user!.usuarioId) });
  } catch (error) {
    siguiente(error);
  }
});
