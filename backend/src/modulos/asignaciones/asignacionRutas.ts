import { Router } from 'express';
import { z } from 'zod';
import { ErrorAplicacion } from '../../compartido/errores/errorAplicacion.js';
import { AsignacionRepositorio } from './asignacionRepositorio.js';

export const tecnicosAsignables = [
  { usuario: 'mperez', nombre: 'Marcos Perez' },
  { usuario: 'gcruz', nombre: 'Gregorio Cruz' },
  { usuario: 'operdomo', nombre: 'Olvin Perdomo' },
  { usuario: 'omencia', nombre: 'Osmar Mencia' },
  { usuario: 'maperdomo', nombre: 'Manuel A. Perdomo' },
  { usuario: 'osmith', nombre: 'Orlin Smith' },
  { usuario: 'dvelasquez', nombre: 'Daniel Velasquez' },
] as const;

const identidad = z.object({
  idOrigen: z.string().trim().min(1).max(150),
  identificadorDetalle: z.string().trim().min(1).max(150),
}).strict();
export const esquemaConsultaAsignaciones = z.object({
  lineas: z.array(identidad).min(1).max(100),
}).strict();
export const esquemaGuardarAsignacion = identidad.extend({
  usuarioAsignado: z.string().trim().min(1).max(100).nullable(),
}).strict();

export function puedeAsignarPedidos(codigoRol: string | null, nombreUsuario: string): boolean {
  return codigoRol?.toUpperCase() === 'ADMINISTRADOR'
    || nombreUsuario.trim().toLowerCase() === 'gcruz';
}

export function crearAsignacionRutas(
  repositorio: AsignacionRepositorio = new AsignacionRepositorio(),
): Router {
  const rutas = Router();

  rutas.get('/usuarios', (solicitud, respuesta) => {
    respuesta.json({
      datos: tecnicosAsignables,
      puedeAsignar: puedeAsignarPedidos(
        solicitud.user?.codigoRol ?? null,
        solicitud.user?.nombreUsuario ?? '',
      ),
    });
  });

  rutas.post('/consultar', async (solicitud, respuesta, siguiente) => {
    try {
      const { lineas } = esquemaConsultaAsignaciones.parse(solicitud.body);
      respuesta.json({ datos: await repositorio.consultar(lineas) });
    } catch (error) {
      siguiente(error);
    }
  });

  rutas.patch('/', async (solicitud, respuesta, siguiente) => {
    try {
      const usuario = solicitud.user!;
      if (!puedeAsignarPedidos(usuario.codigoRol, usuario.nombreUsuario)) {
        throw new ErrorAplicacion(403, 'ASIGNACION_NO_PERMITIDA',
          'No tenés permiso para cambiar la asignación.');
      }
      const datos = esquemaGuardarAsignacion.parse(solicitud.body);
      const tecnico = datos.usuarioAsignado === null
        ? null
        : tecnicosAsignables.find(({ usuario: codigo }) => codigo === datos.usuarioAsignado);
      if (datos.usuarioAsignado !== null && !tecnico) {
        throw new ErrorAplicacion(400, 'TECNICO_NO_PERMITIDO',
          'El técnico seleccionado no está disponible.');
      }
      respuesta.json({ datos: await repositorio.guardar(datos, tecnico ?? null, usuario.usuarioId) });
    } catch (error) {
      siguiente(error);
    }
  });

  return rutas;
}

export const asignacionRutas = crearAsignacionRutas();
