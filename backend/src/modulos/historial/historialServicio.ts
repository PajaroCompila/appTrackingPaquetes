import { ErrorAplicacion } from '../../compartido/errores/errorAplicacion.js';
import type {
  FiltrosHistorial,
  PaginaArticulosHistorial,
  PaginaHistorial,
  PedidoHistorial,
} from './historial.interface.js';
import { HistorialRepositorio } from './historialRepositorio.js';
import { HistorialR1Repositorio } from './historialR1Repositorio.js';
import { AsignacionRepositorio } from '../asignaciones/asignacionRepositorio.js';
import { claveLineaDespachada } from '../despachos/despachoRepositorio.js';
import type { SeguimientoPedidoRepositorio } from '../pedidos/seguimientoPedidoRepositorio.js';
import { EntregaSapRepositorio } from './entregaSapRepositorio.js';
import { esIdentidadEntregaSap } from './entregaSap.interface.js';

let conciliacionEnCurso: Promise<number> | null = null;

export class HistorialServicio {
  public constructor(
    private readonly repositorio = new HistorialRepositorio(),
    private readonly repositorioConsulta?: HistorialR1Repositorio,
    private readonly asignacionRepositorio = new AsignacionRepositorio(),
    private readonly seguimientoRepositorio?: SeguimientoPedidoRepositorio,
    private readonly entregasRepositorio = new EntregaSapRepositorio(),
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
    const [candidatos, candidatosSap, nuevosCerradosSap] = await Promise.all([
      this.repositorio.obtenerDespachadosPendientes(),
      this.repositorio.obtenerDespachadosSapPendientes(),
      this.repositorio.conservarCerradosSapSinDespacho(),
    ]);
    const estados = await this.repositorio.obtenerEstadosR1(candidatos);
    const cerradosSap = await this.repositorio.obtenerCerradosSap(candidatosSap);
    const cerrados = candidatos.filter(({ idOrigen }) =>
      estados.get(idOrigen)?.codigoEstadoVenta === 'C' && !estados.get(idOrigen)?.verificado);
    const validados = candidatos.filter(({ idOrigen }) => estados.get(idOrigen)?.verificado);
    const cantidadCerrados = await this.repositorio.marcarCerrados(
      cerrados.map(({ idOrigen }) => idOrigen),
    );
    const cantidadValidados = await this.repositorio.marcarValidados([
      ...validados.map(({ idOrigen }) =>
        ({ idOrigen, codigoSucursal: estados.get(idOrigen)?.codigoSucursal ?? null })),
      ...cerradosSap.map((idOrigen) => ({ idOrigen, codigoSucursal: null })),
    ]);
    return cantidadCerrados + cantidadValidados + nuevosCerradosSap;
  }

  public async buscar(filtros: FiltrosHistorial): Promise<PaginaHistorial> {
    const cantidadAcumulada = filtros.pagina * filtros.cantidadPorPagina;
    const filtrosAcumulados = { ...filtros, pagina: 1, cantidadPorPagina: cantidadAcumulada };
    const [resultadoR1, resultadoSap, resultadoEntregas] = await Promise.allSettled([
      (this.repositorioConsulta ?? new HistorialR1Repositorio()).buscar(filtrosAcumulados),
      this.repositorio.buscarHistorial(filtrosAcumulados),
      this.entregasRepositorio.buscar(filtrosAcumulados),
    ]);
    if (resultadoR1.status === 'rejected' && resultadoSap.status === 'rejected'
      && resultadoEntregas.status === 'rejected') {
      throw new ErrorAplicacion(503, 'HISTORIAL_NO_DISPONIBLE',
        'El historial no está disponible temporalmente.');
    }
    const r1 = resultadoR1.status === 'fulfilled' ? resultadoR1.value : null;
    const sap = resultadoSap.status === 'fulfilled' ? resultadoSap.value : null;
    const entregas = resultadoEntregas.status === 'fulfilled' ? resultadoEntregas.value : null;
    const todos = [...(r1?.registros ?? []), ...(sap?.registros ?? []), ...(entregas?.registros ?? [])]
      .sort((a, b) => (b.entregaSap?.fechaEntrega ?? b.validadoDetectadoEn ?? b.despachadoEn ?? b.fechaHoraPedido ?? '')
        .localeCompare(a.entregaSap?.fechaEntrega ?? a.validadoDetectadoEn ?? a.despachadoEn ?? a.fechaHoraPedido ?? '')
        || a.idOrigen.localeCompare(b.idOrigen));
    const inicio = (filtros.pagina - 1) * filtros.cantidadPorPagina;
    const registros = todos.slice(inicio, inicio + filtros.cantidadPorPagina);
    await this.agregarResponsablesPedidos(registros);
    if (this.seguimientoRepositorio) await this.seguimientoRepositorio.aplicar(registros);
    return { registros, pagina: filtros.pagina, cantidadPorPagina: filtros.cantidadPorPagina,
      totalRegistros: (r1?.totalRegistros ?? 0) + (sap?.totalRegistros ?? 0) + (entregas?.totalRegistros ?? 0),
      hayMas: Boolean(r1?.hayMas || sap?.hayMas || entregas?.hayMas || todos.length > inicio + registros.length) };
  }

  public async obtener(idOrigen: string, rol?: string): Promise<PedidoHistorial | null> {
    if (esIdentidadEntregaSap(idOrigen)) {
      const entrega = await this.entregasRepositorio.obtener(idOrigen, rol);
      if (entrega && (rol !== 'ADMINISTRADOR' || entrega.estadoHistorial !== 'Entregado, Sin factura')) {
        delete entrega.auditoriaSap;
      }
      return entrega;
    }
    const consulta = idOrigen.startsWith('SAP:')
      ? this.repositorio.obtenerHistorial(idOrigen)
      : (this.repositorioConsulta ?? new HistorialR1Repositorio()).obtener(idOrigen);
    const pedido = await consulta;
    if (pedido) {
      await this.agregarResponsablesPedidos([pedido]);
      if (this.seguimientoRepositorio) await this.seguimientoRepositorio.aplicar([pedido]);
    }
    return pedido;
  }

  public async buscarArticulos(filtros: FiltrosHistorial): Promise<PaginaArticulosHistorial> {
    const cantidadAcumulada = filtros.pagina * filtros.cantidadPorPagina;
    const filtrosAcumulados = { ...filtros, pagina: 1, cantidadPorPagina: cantidadAcumulada };
    const [resultadoR1, resultadoSap, resultadoEntregas] = await Promise.allSettled([
      (this.repositorioConsulta ?? new HistorialR1Repositorio()).buscarArticulos(filtrosAcumulados),
      this.repositorio.buscarArticulosHistorial(filtrosAcumulados),
      this.entregasRepositorio.buscarArticulos(filtrosAcumulados),
    ]);
    if (resultadoR1.status === 'rejected' && resultadoSap.status === 'rejected'
      && resultadoEntregas.status === 'rejected') {
      throw new ErrorAplicacion(503, 'HISTORIAL_NO_DISPONIBLE',
        'El historial no está disponible temporalmente.');
    }
    const r1 = resultadoR1.status === 'fulfilled' ? resultadoR1.value : null;
    const sap = resultadoSap.status === 'fulfilled' ? resultadoSap.value : null;
    const entregas = resultadoEntregas.status === 'fulfilled' ? resultadoEntregas.value : null;
    const todos = [...(r1?.registros ?? []), ...(sap?.registros ?? []), ...(entregas?.registros ?? [])]
      .sort((a, b) => (b.fechaHoraPedido ?? '').localeCompare(a.fechaHoraPedido ?? '')
        || b.idOrigen.localeCompare(a.idOrigen)
        || Number(a.identificadorDetalle ?? 0) - Number(b.identificadorDetalle ?? 0));
    const inicio = (filtros.pagina - 1) * filtros.cantidadPorPagina;
    const registros = todos.slice(inicio, inicio + filtros.cantidadPorPagina);
    await this.agregarResponsablesArticulos(registros);
    if (this.seguimientoRepositorio) await this.seguimientoRepositorio.aplicarArticulos(registros);
    return { registros, pagina: filtros.pagina, cantidadPorPagina: filtros.cantidadPorPagina,
      totalRegistros: (r1?.totalRegistros ?? 0) + (sap?.totalRegistros ?? 0) + (entregas?.totalRegistros ?? 0),
      hayMas: Boolean(r1?.hayMas || sap?.hayMas || entregas?.hayMas || todos.length > inicio + registros.length) };
  }

  private async agregarResponsablesPedidos(pedidos: PedidoHistorial[]): Promise<void> {
    const lineas = pedidos.flatMap((pedido) => pedido.articulos.flatMap((articulo) => {
      const identificadorDetalle = articulo.identificadorDetalle?.trim();
      return identificadorDetalle ? [{ idOrigen: pedido.idOrigen, identificadorDetalle }] : [];
    }));
    if (lineas.length === 0) return;
    let asignaciones;
    try {
      asignaciones = await this.asignacionRepositorio.consultar(lineas);
    } catch {
      return;
    }
    const porLinea = new Map(asignaciones.map((asignacion) => [
      claveLineaDespachada(asignacion.idOrigen, asignacion.identificadorDetalle),
      asignacion.nombreAsignado,
    ]));
    for (const pedido of pedidos) {
      for (const articulo of pedido.articulos) {
        const detalle = articulo.identificadorDetalle?.trim();
        articulo.usuarioAsignado = detalle
          ? porLinea.get(claveLineaDespachada(pedido.idOrigen, detalle)) ?? null
          : null;
      }
      pedido.responsablesAsignados = [...new Set(pedido.articulos
        .map(({ usuarioAsignado }) => usuarioAsignado)
        .filter((nombre): nombre is string => Boolean(nombre)))];
    }
  }

  private async agregarResponsablesArticulos(
    articulos: PaginaArticulosHistorial['registros'],
  ): Promise<void> {
    const lineas = articulos.flatMap((articulo) => articulo.identificadorDetalle?.trim()
      ? [{ idOrigen: articulo.idOrigen, identificadorDetalle: articulo.identificadorDetalle.trim() }]
      : []);
    if (lineas.length === 0) return;
    let asignaciones;
    try {
      asignaciones = await this.asignacionRepositorio.consultar(lineas);
    } catch {
      return;
    }
    const porLinea = new Map(asignaciones.map((asignacion) => [
      claveLineaDespachada(asignacion.idOrigen, asignacion.identificadorDetalle),
      asignacion.nombreAsignado,
    ]));
    for (const articulo of articulos) {
      const detalle = articulo.identificadorDetalle?.trim();
      articulo.usuarioAsignado = detalle
        ? porLinea.get(claveLineaDespachada(articulo.idOrigen, detalle)) ?? null
        : null;
    }
  }
}
