import { ErrorAplicacion } from '../../compartido/errores/errorAplicacion.js';
import type { FiltrosHistorial, PaginaArticulosHistorial, PaginaHistorial, PedidoHistorial } from './historial.interface.js';
import { HistorialRepositorio } from './historialRepositorio.js';
import { HistorialR1Repositorio } from './historialR1Repositorio.js';

let conciliacionEnCurso: Promise<number> | null = null;

export class HistorialServicio {
  public constructor(
    private readonly repositorio = new HistorialRepositorio(),
    private readonly repositorioConsulta?: HistorialR1Repositorio,
  ) {}

  public async sincronizar(): Promise<number> {
    if (conciliacionEnCurso) return conciliacionEnCurso;
    conciliacionEnCurso = this.conciliar();
    try {
      return await conciliacionEnCurso;
    } finally {
      conciliacionEnCurso = null;
    }
  }

  private async conciliar(): Promise<number> {
    const candidatos = await this.repositorio.obtenerDespachadosPendientes();
    const estados = await this.repositorio.obtenerEstadosR1(candidatos);
    const cerrados = candidatos.filter(({ idOrigen }) =>
      estados.get(idOrigen)?.codigoEstadoVenta === 'C' && !estados.get(idOrigen)?.verificado);
    const validados = candidatos.filter(({ idOrigen }) => {
      const estado = estados.get(idOrigen);
      return estado?.verificado;
    });
    const cantidadCerrados = await this.repositorio.marcarCerrados(
      cerrados.map(({ idOrigen }) => idOrigen),
    );
    const cantidadValidados = await this.repositorio.marcarValidados(validados
      .map(({ idOrigen }) =>
        ({ idOrigen, codigoSucursal: estados.get(idOrigen)?.codigoSucursal ?? null })));
    return cantidadCerrados + cantidadValidados;
  }

  public async buscar(filtros: FiltrosHistorial): Promise<PaginaHistorial> {
    try {
      return await (this.repositorioConsulta ?? new HistorialR1Repositorio()).buscar(filtros);
    } catch {
      throw new ErrorAplicacion(503, 'HISTORIAL_NO_DISPONIBLE',
        'El historial no está disponible temporalmente.');
    }
  }

  public async obtener(idOrigen: string): Promise<PedidoHistorial | null> {
    return (this.repositorioConsulta ?? new HistorialR1Repositorio()).obtener(idOrigen);
  }

  public async buscarArticulos(filtros: FiltrosHistorial): Promise<PaginaArticulosHistorial> {
    try {
      return await (this.repositorioConsulta ?? new HistorialR1Repositorio()).buscarArticulos(filtros);
    } catch {
      throw new ErrorAplicacion(503, 'HISTORIAL_NO_DISPONIBLE',
        'El historial no está disponible temporalmente.');
    }
  }
}
