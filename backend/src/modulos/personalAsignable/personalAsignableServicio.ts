import { ErrorAplicacion } from '../../compartido/errores/errorAplicacion.js';
import type { IdentidadAutenticada } from '../autenticacion/autenticacion.interface.js';
import type { TecnicoAsignable } from '../asignaciones/asignacion.interface.js';
import type { AmbitoPersonalAsignable, NuevoPersonalAsignable,
  PersonalAsignable } from './personalAsignable.interface.js';
import { PersonalAsignableRepositorio } from './personalAsignableRepositorio.js';
import { esUsuarioBod } from '../asignaciones/asignacionPermisos.js';

export function ambitosParaSesion(
  usuario: Pick<IdentidadAutenticada, 'codigoRol' | 'nombreUsuario'>,
): readonly AmbitoPersonalAsignable[] {
  if (usuario.codigoRol?.toUpperCase() === 'DASHBOARDS') return [];
  if (usuario.codigoRol?.toUpperCase() === 'ADMINISTRADOR') {
    return ['GENERAL', 'ACALIX_JLARA', 'TCIR01', 'TTBM01'];
  }
  const nombreUsuario = usuario.nombreUsuario.trim().toLowerCase();
  if (esUsuarioBod(nombreUsuario)) return ['GENERAL', 'ACALIX_JLARA', 'TCIR01', 'TTBM01'];
  if (nombreUsuario === 'tlopez') return ['TCIR01'];
  if (nombreUsuario === 'acalix' || nombreUsuario === 'jlara') return ['ACALIX_JLARA'];
  if (nombreUsuario === 'gcruz') return ['GENERAL'];
  return [];
}

export class PersonalAsignableServicio {
  public constructor(private readonly repositorio = new PersonalAsignableRepositorio()) {}

  public async listarAdministracion(): Promise<PersonalAsignable[]> {
    return this.ordenar(await this.repositorio.listarTodos());
  }

  public async listarParaSesion(
    usuario: Pick<IdentidadAutenticada, 'codigoRol' | 'nombreUsuario'>,
  ): Promise<TecnicoAsignable[]> {
    const personas = this.ordenar(await this.repositorio.listarActivos(ambitosParaSesion(usuario)));
    return personas.map(({ codigoAsignacion, nombreCompleto }) => ({
      usuario: codigoAsignacion,
      nombre: nombreCompleto,
    }));
  }

  public async resolverParaSesion(
    usuario: Pick<IdentidadAutenticada, 'codigoRol' | 'nombreUsuario'>,
    codigoAsignacion: string,
  ): Promise<TecnicoAsignable> {
    const persona = await this.repositorio.obtenerActivo(codigoAsignacion, ambitosParaSesion(usuario));
    if (!persona) throw new ErrorAplicacion(400, 'TECNICO_NO_PERMITIDO',
      'La persona seleccionada no está disponible para esta asignación.');
    return { usuario: persona.codigoAsignacion, nombre: persona.nombreCompleto };
  }

  public async crear(datos: NuevoPersonalAsignable, creadoPor: string): Promise<PersonalAsignable> {
    try {
      return await this.repositorio.crear(datos, creadoPor);
    } catch (error) {
      const numero = Number((error as { number?: unknown }).number);
      if (numero === 2601 || numero === 2627) {
        throw new ErrorAplicacion(409, 'PERSONAL_DUPLICADO',
          'Ya existe una persona asignable con ese nombre y apellido.');
      }
      throw error;
    }
  }

  private ordenar(personas: PersonalAsignable[]): PersonalAsignable[] {
    const comparador = new Intl.Collator('es', { sensitivity: 'base' });
    return [...personas].sort((a, b) => comparador.compare(a.nombreCompleto, b.nombreCompleto));
  }
}
