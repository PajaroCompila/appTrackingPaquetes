import { ErrorAplicacion } from '../../compartido/errores/errorAplicacion.js';
import { claveLineaDespachada, type IDespachoRepositorio } from './despachoRepositorio.js';
import {
  type IdentidadLineaDespacho,
  type LineaDespachoOrigenRepositorio,
} from './lineaDespachoOrigenRepositorio.js';

export class DespachoServicio {
  public constructor(
    private readonly despachoRepositorio: IDespachoRepositorio,
    private readonly origenRepositorio: LineaDespachoOrigenRepositorio,
  ) {}

  public async transferir(identidades: IdentidadLineaDespacho[], usuarioId: string) {
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
    const encontradas = new Set(lineas.map(({ idOrigen, identificadorDetalle }) =>
      claveLineaDespachada(idOrigen, identificadorDetalle)));
    const rechazadas = identidades.filter((identidad) =>
      !encontradas.has(claveLineaDespachada(identidad.idOrigen, identidad.identificadorDetalle)));
    if (rechazadas.length > 0) {
      throw new ErrorAplicacion(409, 'LINEA_NO_DISPONIBLE',
        'Una o más líneas no existen, son ambiguas o ya no están disponibles.');
    }
    const resultado = await this.despachoRepositorio.guardarLineas(lineas, usuarioId);
    return { ...resultado, omitidas: [], rechazadas: [] };
  }
}
