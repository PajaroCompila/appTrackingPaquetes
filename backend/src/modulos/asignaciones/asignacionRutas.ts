import { Router } from 'express';
import { z } from 'zod';
import { ErrorAplicacion } from '../../compartido/errores/errorAplicacion.js';
import type { IdentidadAutenticada } from '../autenticacion/autenticacion.interface.js';
import type { TecnicoAsignable } from './asignacion.interface.js';
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

export function usuariosAsignablesParaSesion(
  usuario: Pick<IdentidadAutenticada, 'codigoRol' | 'nombreUsuario' | 'nombreVisible'>,
): readonly TecnicoAsignable[] {
  if (puedeAsignarPedidos(usuario.codigoRol, usuario.nombreUsuario)) return tecnicosAsignables;
  return [{ usuario: usuario.nombreUsuario, nombre: usuario.nombreVisible }];
}

export function resolverTecnicoAsignable(
  usuario: Pick<IdentidadAutenticada, 'codigoRol' | 'nombreUsuario' | 'nombreVisible'>,
  usuarioAsignado: string | null,
): TecnicoAsignable | null {
  if (puedeAsignarPedidos(usuario.codigoRol, usuario.nombreUsuario)) {
    if (usuarioAsignado === null) return null;
    const tecnico = tecnicosAsignables.find(({ usuario: codigo }) => codigo === usuarioAsignado);
    if (!tecnico) {
      throw new ErrorAplicacion(400, 'TECNICO_NO_PERMITIDO',
        'El técnico seleccionado no está disponible.');
    }
    return tecnico;
  }

  throw new ErrorAplicacion(403, 'ASIGNACION_MANUAL_NO_PERMITIDA',
    'La asignación para este usuario se realiza automáticamente.');
}

export function crearAsignacionRutas(
  repositorio: AsignacionRepositorio = new AsignacionRepositorio(),
): Router {
  const rutas = Router();

  rutas.get('/usuarios', (solicitud, respuesta) => {
    const usuario = solicitud.user!;
    const puedeAsignarTodos = puedeAsignarPedidos(usuario.codigoRol, usuario.nombreUsuario);
    respuesta.json({
      datos: usuariosAsignablesParaSesion(usuario),
      puedeAsignar: puedeAsignarTodos,
      puedeAsignarTodos,
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

  rutas.post('/autoasignar', async (solicitud, respuesta, siguiente) => {
    try {
      const usuario = solicitud.user!;
      if (puedeAsignarPedidos(usuario.codigoRol, usuario.nombreUsuario)) {
        throw new ErrorAplicacion(403, 'AUTOASIGNACION_NO_APLICA',
          'Este usuario debe seleccionar la asignación manualmente.');
      }
      const { lineas } = esquemaConsultaAsignaciones.parse(solicitud.body);
      const tecnico = { usuario: usuario.nombreUsuario, nombre: usuario.nombreVisible };
      respuesta.json({
        datos: await repositorio.asignarAutomaticamente(lineas, tecnico, usuario.usuarioId),
      });
    } catch (error) {
      siguiente(error);
    }
  });

  rutas.patch('/', async (solicitud, respuesta, siguiente) => {
    try {
      const usuario = solicitud.user!;
      const datos = esquemaGuardarAsignacion.parse(solicitud.body);
      const tecnico = resolverTecnicoAsignable(usuario, datos.usuarioAsignado);
      respuesta.json({ datos: await repositorio.guardar(datos, tecnico, usuario.usuarioId) });
    } catch (error) {
      if (error instanceof ErrorAplicacion
        && error.codigo === 'ASIGNACION_MANUAL_NO_PERMITIDA') {
        respuesta.status(error.estadoHttp).json({ exito: false, mensaje: error.message });
        return;
      }
      siguiente(error);
    }
  });

  return rutas;
}

export const asignacionRutas = crearAsignacionRutas();
