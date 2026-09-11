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

const tecnicosAsignablesAcalixJlara = [
  { usuario: 'jlara', nombre: 'Jorge Lara' },
  { usuario: 'acalix', nombre: 'Ana Calix' },
] as const;
const tommyAsignable = [{ usuario: 'tlopez', nombre: 'Tommy López' }] as const;

const identidad = z.object({
  idOrigen: z.string().trim().min(1).max(150),
  identificadorDetalle: z.string().trim().min(1).max(150),
}).strict();
export const esquemaConsultaAsignaciones = z.object({
  lineas: z.array(identidad).min(1).max(100),
}).strict();
export const esquemaGuardarAsignacion = identidad.extend({
  usuarioAsignado: z.string().trim().min(1).max(100),
}).strict();
export const esquemaReasignar = esquemaGuardarAsignacion.extend({
  actualizadoEn: z.iso.datetime({ offset: true }),
}).strict();

export function puedeAsignarPedidos(codigoRol: string | null, nombreUsuario: string): boolean {
  return codigoRol?.toUpperCase() === 'ADMINISTRADOR'
    || ['gcruz', 'acalix', 'jlara', 'tlopez'].includes(nombreUsuario.trim().toLowerCase());
}

export function puedeReasignarPedidos(codigoRol: string | null, nombreUsuario: string): boolean {
  return codigoRol?.toUpperCase() === 'ADMINISTRADOR'
    || nombreUsuario.trim().toLowerCase() === 'gcruz';
}

export function usuariosAsignablesParaSesion(
  usuario: Pick<IdentidadAutenticada, 'codigoRol' | 'nombreUsuario' | 'nombreVisible'>,
): readonly TecnicoAsignable[] {
  const nombreUsuario = usuario.nombreUsuario.trim().toLowerCase();
  if (nombreUsuario === 'tlopez') return tommyAsignable;
  if (nombreUsuario === 'acalix' || nombreUsuario === 'jlara') return tecnicosAsignablesAcalixJlara;
  if (puedeAsignarPedidos(usuario.codigoRol, usuario.nombreUsuario)) return tecnicosAsignables;
  return [];
}

export function resolverTecnicoAsignable(
  usuario: Pick<IdentidadAutenticada, 'codigoRol' | 'nombreUsuario' | 'nombreVisible'>,
  usuarioAsignado: string,
): TecnicoAsignable {
  const nombreUsuario = usuario.nombreUsuario.trim().toLowerCase();
  if (nombreUsuario === 'tlopez') {
    if (usuarioAsignado !== 'tlopez') throw new ErrorAplicacion(400, 'TECNICO_NO_PERMITIDO',
      'El usuario seleccionado no está disponible.');
    return tommyAsignable[0];
  }
  if (nombreUsuario === 'acalix' || nombreUsuario === 'jlara') {
    const tecnico = tecnicosAsignablesAcalixJlara.find(({ usuario: codigo }) => codigo === usuarioAsignado);
    if (!tecnico) {
      throw new ErrorAplicacion(400, 'TECNICO_NO_PERMITIDO',
        'El técnico seleccionado no está disponible.');
    }
    return tecnico;
  }
  if (puedeAsignarPedidos(usuario.codigoRol, usuario.nombreUsuario)) {
    const tecnico = tecnicosAsignables.find(({ usuario: codigo }) => codigo === usuarioAsignado);
    if (!tecnico) {
      throw new ErrorAplicacion(400, 'TECNICO_NO_PERMITIDO',
        'El técnico seleccionado no está disponible.');
    }
    return tecnico;
  }

  throw new ErrorAplicacion(403, 'ASIGNACION_MANUAL_NO_PERMITIDA',
    'No tiene permisos para asignar pedidos.');
}

export function crearAsignacionRutas(
  repositorio: AsignacionRepositorio = new AsignacionRepositorio(),
): Router {
  const rutas = Router();

  rutas.get('/usuarios', (solicitud, respuesta) => {
    const usuario = solicitud.user!;
    const nombreUsuario = usuario.nombreUsuario.trim().toLowerCase();
    const datos = usuariosAsignablesParaSesion(usuario);
    const puedeAsignarTodos = usuario.codigoRol?.toUpperCase() === 'ADMINISTRADOR'
      || nombreUsuario === 'gcruz';
    respuesta.json({
      datos,
      puedeAsignar: datos.length > 0,
      puedeAsignarTodos,
      puedeReasignar: puedeReasignarPedidos(usuario.codigoRol, usuario.nombreUsuario),
    });
  });

  rutas.post('/consultar', async (solicitud, respuesta, siguiente) => {
    try {
      const { lineas } = esquemaConsultaAsignaciones.parse(solicitud.body);
      respuesta.json({
        datos: await repositorio.consultar(lineas),
        horaServidor: new Date().toISOString(),
      });
    } catch (error) {
      siguiente(error);
    }
  });

  rutas.patch('/', async (solicitud, respuesta, siguiente) => {
    try {
      const usuario = solicitud.user!;
      const datos = esquemaGuardarAsignacion.parse(solicitud.body);
      if (usuario.nombreUsuario.trim().toLowerCase() === 'tlopez'
        && !datos.idOrigen.toUpperCase().startsWith('R1:TCIR01:')) {
        throw new ErrorAplicacion(403, 'ALMACEN_NO_PERMITIDO',
          'Solo puede asignarse pedidos de Circunvalación.');
      }
      const tecnico = resolverTecnicoAsignable(usuario, datos.usuarioAsignado);
      const resultado = await repositorio.guardar(datos, tecnico, usuario.usuarioId);
      if (!resultado.confirmada) {
        respuesta.status(409).json({
          exito: false,
          mensaje: 'Este pedido/artículo ya fue asignado.',
          datos: resultado.asignacion,
        });
        return;
      }
      respuesta.json({ datos: resultado.asignacion });
    } catch (error) {
      if (error instanceof ErrorAplicacion
        && ['ASIGNACION_MANUAL_NO_PERMITIDA', 'ALMACEN_NO_PERMITIDO'].includes(error.codigo)) {
        respuesta.status(error.estadoHttp).json({ exito: false, mensaje: error.message });
        return;
      }
      siguiente(error);
    }
  });

  rutas.patch('/reasignar', async (solicitud, respuesta, siguiente) => {
    try {
      const usuario = solicitud.user!;
      if (!puedeReasignarPedidos(usuario.codigoRol, usuario.nombreUsuario)) {
        respuesta.status(403).json({
          exito: false,
          mensaje: 'No tiene permisos para reasignar pedidos.',
        });
        return;
      }
      const datos = esquemaReasignar.parse(solicitud.body);
      const tecnico = resolverTecnicoAsignable(usuario, datos.usuarioAsignado);
      const resultado = await repositorio.reasignar(
        datos,
        tecnico,
        usuario.usuarioId,
        new Date(datos.actualizadoEn),
      );
      if (!resultado.actualizada) {
        respuesta.status(409).json({
          exito: false,
          mensaje: 'La asignación cambió mientras estaba abierta. Revise el responsable actual.',
          datos: resultado.asignacion,
        });
        return;
      }
      respuesta.json({ datos: resultado.asignacion });
    } catch (error) {
      siguiente(error);
    }
  });

  return rutas;
}

export const asignacionRutas = crearAsignacionRutas();
