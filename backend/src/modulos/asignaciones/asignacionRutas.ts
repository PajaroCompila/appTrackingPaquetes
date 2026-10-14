import { Router } from 'express';
import { z } from 'zod';
import { ErrorAplicacion } from '../../compartido/errores/errorAplicacion.js';
import type { IdentidadAutenticada } from '../autenticacion/autenticacion.interface.js';
import type { TecnicoAsignable } from './asignacion.interface.js';
import { AsignacionRepositorio } from './asignacionRepositorio.js';
import { PersonalAsignableServicio } from '../personalAsignable/personalAsignableServicio.js';
import {
  esUsuarioBod,
  puedeAsignarPedidos,
  puedeReasignarPedidos,
} from './asignacionPermisos.js';

export { puedeAsignarPedidos, puedeReasignarPedidos } from './asignacionPermisos.js';

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
const tecnicosAsignablesAdministrador = [
  ...tecnicosAsignables,
  ...tecnicosAsignablesAcalixJlara,
] as const;
const tommyAsignable = [{ usuario: 'tlopez', nombre: 'Tommy López' }] as const;
const kevinAsignable = [{ usuario: 'bodegatbm', nombre: 'Kevin Carranza' }] as const;
const tecnicosAsignablesCompletos = [
  ...tecnicosAsignablesAdministrador,
  ...tommyAsignable,
  ...kevinAsignable,
] as const;

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

type IdentidadAsignador = Pick<IdentidadAutenticada, 'codigoRol' | 'nombreUsuario' | 'nombreVisible'>;
interface CatalogoPersonalAsignable {
  listarParaSesion(usuario: IdentidadAsignador): Promise<readonly TecnicoAsignable[]>;
  resolverParaSesion(usuario: IdentidadAsignador, codigoAsignacion: string): Promise<TecnicoAsignable>;
}

export function usuariosAsignablesParaSesion(
  usuario: Pick<IdentidadAutenticada, 'codigoRol' | 'nombreUsuario' | 'nombreVisible'>,
): readonly TecnicoAsignable[] {
  if (usuario.codigoRol?.toUpperCase() === 'DASHBOARDS') return [];
  if (usuario.codigoRol?.toUpperCase() === 'ADMINISTRADOR') return tecnicosAsignablesAdministrador;
  const nombreUsuario = usuario.nombreUsuario.trim().toLowerCase();
  if (esUsuarioBod(nombreUsuario)) return tecnicosAsignablesCompletos;
  if (nombreUsuario === 'tlopez') return tommyAsignable;
  if (nombreUsuario === 'acalix' || nombreUsuario === 'jlara') return tecnicosAsignablesAcalixJlara;
  if (puedeAsignarPedidos(usuario.codigoRol, usuario.nombreUsuario)) return tecnicosAsignables;
  return [];
}

export function resolverTecnicoAsignable(
  usuario: Pick<IdentidadAutenticada, 'codigoRol' | 'nombreUsuario' | 'nombreVisible'>,
  usuarioAsignado: string,
): TecnicoAsignable {
  if (usuario.codigoRol?.toUpperCase() === 'ADMINISTRADOR') {
    const tecnico = tecnicosAsignablesAdministrador.find(
      ({ usuario: codigo }) => codigo === usuarioAsignado,
    );
    if (!tecnico) {
      throw new ErrorAplicacion(400, 'TECNICO_NO_PERMITIDO',
        'El técnico seleccionado no está disponible.');
    }
    return tecnico;
  }
  const nombreUsuario = usuario.nombreUsuario.trim().toLowerCase();
  if (esUsuarioBod(nombreUsuario)) {
    const tecnico = tecnicosAsignablesCompletos.find(
      ({ usuario: codigo }) => codigo === usuarioAsignado,
    );
    if (!tecnico) {
      throw new ErrorAplicacion(400, 'TECNICO_NO_PERMITIDO',
        'El técnico seleccionado no está disponible.');
    }
    return tecnico;
  }
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

async function conservarTecnicosActivos(
  repositorio: AsignacionRepositorio,
  tecnicos: readonly TecnicoAsignable[],
): Promise<readonly TecnicoAsignable[]> {
  if (!repositorio.filtrarUsuariosActivos) return tecnicos;
  const activos = await repositorio.filtrarUsuariosActivos(tecnicos.map(({ usuario }) => usuario));
  return tecnicos.filter(({ usuario }) => activos.has(usuario.toLowerCase()));
}

async function exigirTecnicoActivo(
  repositorio: AsignacionRepositorio,
  tecnico: TecnicoAsignable,
): Promise<void> {
  if (!repositorio.filtrarUsuariosActivos) return;
  const activos = await repositorio.filtrarUsuariosActivos([tecnico.usuario]);
  if (!activos.has(tecnico.usuario.toLowerCase())) {
    throw new ErrorAplicacion(409, 'TECNICO_INACTIVO',
      'El usuario seleccionado está inactivo y no puede recibir nuevas asignaciones.');
  }
}

export function crearAsignacionRutas(
  repositorio: AsignacionRepositorio = new AsignacionRepositorio(),
  personalAsignableServicio: CatalogoPersonalAsignable = {
      listarParaSesion: async (usuario) => conservarTecnicosActivos(
        repositorio, usuariosAsignablesParaSesion(usuario)),
      resolverParaSesion: async (usuario, codigoAsignacion) => {
        const tecnico = resolverTecnicoAsignable(usuario, codigoAsignacion);
        await exigirTecnicoActivo(repositorio, tecnico);
        return tecnico;
      },
    },
): Router {
  const rutas = Router();

  rutas.get('/usuarios', async (solicitud, respuesta, siguiente) => {
    try {
      const usuario = solicitud.user!;
      const nombreUsuario = usuario.nombreUsuario.trim().toLowerCase();
      const datos = await personalAsignableServicio.listarParaSesion(usuario);
      const puedeAsignarTodos = usuario.codigoRol?.toUpperCase() === 'ADMINISTRADOR'
        || nombreUsuario === 'gcruz'
        || esUsuarioBod(nombreUsuario);
      respuesta.json({
        datos,
        puedeAsignar: datos.length > 0,
        puedeAsignarTodos,
        puedeReasignar: puedeReasignarPedidos(usuario.codigoRol, usuario.nombreUsuario),
      });
    } catch (error) {
      siguiente(error);
    }
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
      const datos = esquemaGuardarAsignacion.parse(solicitud.body);
      if (usuario.nombreUsuario.trim().toLowerCase() === 'tlopez'
        && !datos.idOrigen.toUpperCase().startsWith('R1:TCIR01:')) {
        throw new ErrorAplicacion(403, 'ALMACEN_NO_PERMITIDO',
          'Solo puede asignarse pedidos de Circunvalación.');
      }
      const tecnico = await personalAsignableServicio.resolverParaSesion(usuario, datos.usuarioAsignado);
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
      const usuario = solicitud.user;
      if (!usuario) throw new ErrorAplicacion(401, 'SESION_REQUERIDA', 'Debés iniciar sesión.');
      if (!puedeReasignarPedidos(usuario.codigoRol, usuario.nombreUsuario)) {
        respuesta.status(403).json({
          exito: false,
          mensaje: 'No tiene permisos para reasignar pedidos.',
        });
        return;
      }
      const datos = esquemaReasignar.parse(solicitud.body);
      if (usuario.nombreUsuario.trim().toLowerCase() === 'tlopez'
        && !datos.idOrigen.toUpperCase().startsWith('R1:TCIR01:')) {
        throw new ErrorAplicacion(403, 'ALMACEN_NO_PERMITIDO',
          'Solo puede asignarse pedidos de Circunvalación.');
      }
      const tecnico = await personalAsignableServicio.resolverParaSesion(usuario, datos.usuarioAsignado);
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

export const asignacionRutas = crearAsignacionRutas(
  new AsignacionRepositorio(), new PersonalAsignableServicio());
