import { ErrorAplicacion } from '../../compartido/errores/errorAplicacion.js';
import { claveLineaDespachada, type IDespachoRepositorio } from './despachoRepositorio.js';
import {
  type IdentidadLineaDespacho,
  type LineaDespachoOrigenRepositorio,
} from './lineaDespachoOrigenRepositorio.js';
import type { IdentidadAutenticada } from '../autenticacion/autenticacion.interface.js';
import { puedeVerAlmacen } from '../usuarios/accesoAlmacenes.js';
import { AsignacionRepositorio } from '../asignaciones/asignacionRepositorio.js';

export class DespachoServicio {
  public constructor(
    private readonly despachoRepositorio: IDespachoRepositorio,
    private readonly origenRepositorio: LineaDespachoOrigenRepositorio,
    private readonly asignacionRepositorio = new AsignacionRepositorio(),
  ) {}

  public async transferir(identidades: IdentidadLineaDespacho[], usuarioId: string,
    usuario?: IdentidadAutenticada) {
    const claves = identidades.map(({ idOrigen, identificadorDetalle }) =>
      claveLineaDespachada(idOrigen, identificadorDetalle));
    if (new Set(claves).size !== claves.length) {
      throw new ErrorAplicacion(400, 'LINEAS_DUPLICADAS', 'La selección contiene líneas duplicadas.');
    }
    const existentes = await this.despachoRepositorio.identidadesLineas();
    const yaTransferidas = identidades.filter((identidad) =>
      existentes.has(claveLineaDespachada(identidad.idOrigen, identidad.identificadorDetalle)));
    if (yaTransferidas.length > 0) {
      throw new ErrorAplicacion(409, 'LINEA_YA_TRANSFERIDA', 'Una o más líneas ya fueron transferidas.');
    }
    const lineas = await this.origenRepositorio.obtenerLineas(identidades);
    if (usuario && lineas.some(({ articulo }) => !puedeVerAlmacen(usuario, articulo.codigoAlmacen))) {
      throw new ErrorAplicacion(403, 'ALMACEN_NO_PERMITIDO',
        'No tiene acceso a la bodega de uno de los artículos seleccionados.');
    }
    const encontradas = new Set(lineas.map(({ idOrigen, identificadorDetalle }) =>
      claveLineaDespachada(idOrigen, identificadorDetalle)));
    const rechazadas = identidades.filter((identidad) =>
      !encontradas.has(claveLineaDespachada(identidad.idOrigen, identidad.identificadorDetalle)));
    if (rechazadas.length > 0) {
      throw new ErrorAplicacion(409, 'LINEA_NO_DISPONIBLE',
        'Una o más líneas no existen, son ambiguas o ya no están disponibles.');
    }
    if (usuario && !this.puedeOperarCualquierAsignacion(usuario)) {
      const asignaciones = await this.asignacionRepositorio.consultar(identidades);
      const ajenas = asignaciones.filter(({ usuarioAsignado }) =>
        usuarioAsignado && !this.puedeOperarAsignacion(usuario, usuarioAsignado));
      if (ajenas.length > 0) {
        throw new ErrorAplicacion(403, 'RESPONSABLE_NO_AUTORIZADO',
          'Solo la persona asignada puede transferir esta partida.');
      }
    }
    const resultado = await this.despachoRepositorio.guardarLineas(lineas, usuarioId);
    return { ...resultado, omitidas: [], rechazadas: [] };
  }

  private puedeOperarCualquierAsignacion(usuario: IdentidadAutenticada): boolean {
    return usuario.codigoRol?.toUpperCase() === 'ADMINISTRADOR'
      || usuario.nombreUsuario.trim().toLowerCase() === 'gcruz';
  }

  private puedeOperarAsignacion(usuario: IdentidadAutenticada, usuarioAsignado: string): boolean {
    const nombreUsuario = usuario.nombreUsuario.trim().toLowerCase();
    const asignado = usuarioAsignado.trim().toLowerCase();
    if (usuario.codigoRol?.toUpperCase() === 'ADMINISTRADOR' || nombreUsuario === 'gcruz') return true;
    if (nombreUsuario === 'acalix' || nombreUsuario === 'jlara') {
      return asignado === 'acalix' || asignado === 'jlara';
    }
    return nombreUsuario === asignado;
  }
}
