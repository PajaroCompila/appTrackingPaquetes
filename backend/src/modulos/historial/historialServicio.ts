import { ErrorAplicacion } from '../../compartido/errores/errorAplicacion.js';
import type { FiltrosHistorial, PaginaHistorial, PedidoHistorial } from './historial.interface.js';
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
    const [candidatos, candidatosSap] = await Promise.all([
      this.repositorio.obtenerDespachadosPendientes(),
      this.repositorio.obtenerDespachadosSapPendientes(),
    ]);
    const estados = await this.repositorio.obtenerEstadosR1(candidatos);
    const cerradosSap = await this.repositorio.obtenerCerradosSap(candidatosSap);
    const cerrados = candidatos.filter(({ idOrigen }) =>
      estados.get(idOrigen)?.codigoEstadoVenta === 'C' && !estados.get(idOrigen)?.verificado);
    const validados = candidatos.filter(({ idOrigen }) => {
      const estado = estados.get(idOrigen);
      return estado?.verificado;
    });
    const cantidadCerrados = await this.repositorio.marcarCerrados(
      cerrados.map(({ idOrigen }) => idOrigen),
    );
    const cantidadValidados = await this.repositorio.marcarValidados([
      ...validados.map(({ idOrigen }) =>
        ({ idOrigen, codigoSucursal: estados.get(idOrigen)?.codigoSucursal ?? null })),
      ...cerradosSap.map((idOrigen) => ({ idOrigen, codigoSucursal: null })),
    ]);
    return cantidadCerrados + cantidadValidados;
  }

  public async buscar(filtros: FiltrosHistorial): Promise<PaginaHistorial> {
    const cantidadAcumulada = filtros.pagina * filtros.cantidadPorPagina;
    const filtrosAcumulados = { ...filtros, pagina: 1, cantidadPorPagina: cantidadAcumulada };
    const [resultadoR1, resultadoSap] = await Promise.allSettled([
      (this.repositorioConsulta ?? new HistorialR1Repositorio()).buscar(filtrosAcumulados),
      this.repositorio.buscarHistorial(filtrosAcumulados),
    ]);
    if (resultadoR1.status === 'rejected' && resultadoSap.status === 'rejected') {
      throw new ErrorAplicacion(503, 'HISTORIAL_NO_DISPONIBLE',
        'El historial no está disponible temporalmente.');
    }
    const r1 = resultadoR1.status === 'fulfilled' ? resultadoR1.value : null;
    const sap = resultadoSap.status === 'fulfilled' ? resultadoSap.value : null;
    const todos = [...(r1?.registros ?? []), ...(sap?.registros ?? [])]
      .sort((a, b) => (b.validadoDetectadoEn ?? b.despachadoEn ?? b.fechaHoraPedido ?? '')
        .localeCompare(a.validadoDetectadoEn ?? a.despachadoEn ?? a.fechaHoraPedido ?? '')
        || a.idOrigen.localeCompare(b.idOrigen));
    const inicio = (filtros.pagina - 1) * filtros.cantidadPorPagina;
    const registros = todos.slice(inicio, inicio + filtros.cantidadPorPagina);
    return { registros, pagina: filtros.pagina, cantidadPorPagina: filtros.cantidadPorPagina,
      hayMas: Boolean(r1?.hayMas || sap?.hayMas || todos.length > inicio + registros.length) };
  }

  public async obtener(idOrigen: string): Promise<PedidoHistorial | null> {
    return idOrigen.startsWith('SAP:')
      ? this.repositorio.obtenerHistorial(idOrigen)
      : (this.repositorioConsulta ?? new HistorialR1Repositorio()).obtener(idOrigen);
  }
}
