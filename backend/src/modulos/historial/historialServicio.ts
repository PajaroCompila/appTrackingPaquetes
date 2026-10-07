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
import { esLineaFlete } from '../pedidos/lineaFlete.js';

let conciliacionEnCurso: Promise<number> | null = null;
const duracionCacheHistorialMs = 15_000;
const maximoConsultasCacheadas = 100;
type ResultadoListadoHistorial = PaginaHistorial | PaginaArticulosHistorial;
interface ConsultaHistorialCompartida {
  promesa: Promise<ResultadoListadoHistorial>;
  expiraEn: number | null;
}

function claveFiltrosHistorial(tipo: 'pedidos' | 'articulos', filtros: FiltrosHistorial): string {
  return JSON.stringify({
    tipo,
    fechaDesde: filtros.fechaDesde,
    fechaHasta: filtros.fechaHasta,
    numeroPedido: filtros.numeroPedido ?? null,
    codigosAlmacen: [...filtros.codigosAlmacen].sort(),
    pagina: filtros.pagina,
    cantidadPorPagina: filtros.cantidadPorPagina,
    clasificacion: filtros.clasificacion ?? null,
  });
}

function prioridadRegistroHistorial(
  registro: PedidoHistorial | PaginaArticulosHistorial['registros'][number],
): number {
  if (registro.estadoHistorial === 'Facturado') return 4;
  if (registro.estadoHistorial === 'CERRADO') return 3;
  if (registro.estadoHistorial) return 2;
  return 1;
}

function preferirRegistro<T extends PedidoHistorial | PaginaArticulosHistorial['registros'][number]>(
  actual: T,
  candidato: T,
): T {
  const diferencia = prioridadRegistroHistorial(candidato) - prioridadRegistroHistorial(actual);
  if (diferencia !== 0) return diferencia > 0 ? candidato : actual;
  if (Boolean(candidato.despachadoEn) !== Boolean(actual.despachadoEn)) {
    return candidato.despachadoEn ? candidato : actual;
  }
  return actual;
}

function deduplicarPedidosHistorial(registros: PedidoHistorial[]): PedidoHistorial[] {
  const unicos = new Map<string, PedidoHistorial>();
  for (const registro of registros) {
    const clave = registro.numeroPedido.trim() || registro.idOrigen;
    const actual = unicos.get(clave);
    unicos.set(clave, actual ? preferirRegistro(actual, registro) : registro);
  }
  return [...unicos.values()];
}

function deduplicarArticulosHistorial(
  registros: PaginaArticulosHistorial['registros'],
): PaginaArticulosHistorial['registros'] {
  const unicos = new Map<string, PaginaArticulosHistorial['registros'][number]>();
  for (const registro of registros) {
    const identidad = registro.identificadorDetalle?.trim()
      || `${registro.codigoArticulo ?? ''}:${registro.codigoAlmacen ?? ''}`;
    const clave = `${registro.numeroPedido.trim() || registro.idOrigen}\u0000${identidad}`;
    const actual = unicos.get(clave);
    unicos.set(clave, actual ? preferirRegistro(actual, registro) : registro);
  }
  return [...unicos.values()];
}

export class HistorialServicio {
  private readonly consultasCompartidas = new Map<string, ConsultaHistorialCompartida>();

  public constructor(
    private readonly repositorio = new HistorialRepositorio(),
    private readonly repositorioConsulta?: HistorialR1Repositorio,
    private readonly asignacionRepositorio = new AsignacionRepositorio(),
    private readonly seguimientoRepositorio?: SeguimientoPedidoRepositorio,
    private readonly entregasRepositorio = new EntregaSapRepositorio(),
    private readonly duracionCacheMs = duracionCacheHistorialMs,
    private readonly ahora: () => number = Date.now,
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
    const [cerradosSap, facturadosSapR1] = await Promise.all([
      this.repositorio.obtenerCerradosSap(candidatosSap),
      this.repositorio.obtenerFacturadosSapPorNumero(candidatos),
    ]);
    const cerrados = candidatos.filter(({ idOrigen }) =>
      estados.get(idOrigen)?.codigoEstadoVenta === 'C'
      && !estados.get(idOrigen)?.facturado && !facturadosSapR1.has(idOrigen));
    const validados = candidatos.filter(({ idOrigen }) =>
      estados.get(idOrigen)?.facturado || facturadosSapR1.has(idOrigen));
    const cierresSapFacturados = cerradosSap.filter(({ tieneFacturaDirecta,
      tieneFacturaViaEntrega }) => tieneFacturaDirecta || tieneFacturaViaEntrega);
    const cierresSapSinFactura = cerradosSap.filter(({ tieneFacturaDirecta,
      tieneFacturaViaEntrega }) => !tieneFacturaDirecta && !tieneFacturaViaEntrega);
    const cantidadCerrados = await this.repositorio.marcarCerrados([
      ...cerrados.map(({ idOrigen }) => idOrigen),
      ...cierresSapSinFactura.map(({ idOrigen }) => idOrigen),
    ]);
    const cantidadValidados = await this.repositorio.marcarValidados([
      ...validados.map(({ idOrigen }) =>
        ({ idOrigen, codigoSucursal: estados.get(idOrigen)?.codigoSucursal ?? null })),
      ...cierresSapFacturados.map(({ idOrigen }) => ({ idOrigen, codigoSucursal: null })),
    ]);
    return cantidadCerrados + cantidadValidados + nuevosCerradosSap;
  }

  public async buscar(filtros: FiltrosHistorial): Promise<PaginaHistorial> {
    return this.compartirConsulta('pedidos', filtros, () => this.buscarSinCache(filtros));
  }

  private async buscarSinCache(filtros: FiltrosHistorial): Promise<PaginaHistorial> {
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
    const combinados = [...(r1?.registros ?? []), ...(sap?.registros ?? []), ...(entregas?.registros ?? [])]
      .flatMap((pedido) => {
        const articulos = pedido.articulos.filter((articulo) =>
          !esLineaFlete(articulo.codigoArticulo, articulo.descripcion));
        return pedido.articulos.length > 0 && articulos.length === 0 ? [] : [{ ...pedido, articulos }];
      });
    await this.aplicarCierres(combinados);
    const todos = deduplicarPedidosHistorial(combinados)
      .sort((a, b) => (b.entregaSap?.fechaEntrega ?? b.validadoDetectadoEn ?? b.despachadoEn ?? b.fechaHoraPedido ?? '')
        .localeCompare(a.entregaSap?.fechaEntrega ?? a.validadoDetectadoEn ?? a.despachadoEn ?? a.fechaHoraPedido ?? '')
        || a.idOrigen.localeCompare(b.idOrigen));
    const inicio = (filtros.pagina - 1) * filtros.cantidadPorPagina;
    const registros = todos.slice(inicio, inicio + filtros.cantidadPorPagina);
    await Promise.all([
      this.agregarResponsablesPedidos(registros),
      this.agregarIngresosHistorial(registros),
      this.seguimientoRepositorio?.aplicar(registros) ?? Promise.resolve(),
    ]);
    return { registros, pagina: filtros.pagina, cantidadPorPagina: filtros.cantidadPorPagina,
      totalRegistros: (r1?.totalRegistros ?? 0) + (sap?.totalRegistros ?? 0) + (entregas?.totalRegistros ?? 0),
      hayMas: Boolean(r1?.hayMas || sap?.hayMas || entregas?.hayMas || todos.length > inicio + registros.length) };
  }

  public async obtener(idOrigen: string, rol?: string): Promise<PedidoHistorial | null> {
    if (esIdentidadEntregaSap(idOrigen)) {
      const entrega = await this.entregasRepositorio.obtener(idOrigen, rol);
      const cantidadOriginal = entrega?.articulos.length ?? 0;
      if (entrega) entrega.articulos = entrega.articulos.filter((articulo) =>
        !esLineaFlete(articulo.codigoArticulo, articulo.descripcion));
      if (entrega && (rol !== 'ADMINISTRADOR' || entrega.estadoHistorial !== 'Entregado, Sin factura')) {
        delete entrega.auditoriaSap;
      }
      return cantidadOriginal > 0 && entrega?.articulos.length === 0 ? null : entrega;
    }
    let pedido: PedidoHistorial | null;
    if (idOrigen.startsWith('SAP:')) {
      pedido = await this.repositorio.obtenerHistorial(idOrigen);
    } else {
      pedido = await (this.repositorioConsulta ?? new HistorialR1Repositorio()).obtener(idOrigen);
      if (!pedido) pedido = await this.repositorio.obtenerHistorial(idOrigen);
    }
    if (pedido) {
      const cantidadOriginal = pedido.articulos.length;
      pedido.articulos = pedido.articulos.filter((articulo) =>
        !esLineaFlete(articulo.codigoArticulo, articulo.descripcion));
      if (cantidadOriginal > 0 && pedido.articulos.length === 0) return null;
      await this.aplicarCierres([pedido]);
      await Promise.all([
        this.agregarResponsablesPedidos([pedido]),
        this.agregarIngresosHistorial([pedido]),
        this.agregarReceptorDevolucion(pedido),
      ]);
      if (this.seguimientoRepositorio) await this.seguimientoRepositorio.aplicar([pedido]);
    }
    return pedido;
  }

  public async buscarArticulos(filtros: FiltrosHistorial): Promise<PaginaArticulosHistorial> {
    return this.compartirConsulta('articulos', filtros, () => this.buscarArticulosSinCache(filtros));
  }

  private async buscarArticulosSinCache(filtros: FiltrosHistorial): Promise<PaginaArticulosHistorial> {
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
    const combinados = [...(r1?.registros ?? []), ...(sap?.registros ?? []), ...(entregas?.registros ?? [])]
      .filter((articulo) => !esLineaFlete(articulo.codigoArticulo, articulo.descripcion));
    await this.aplicarCierres(combinados);
    const todos = deduplicarArticulosHistorial(combinados)
      .sort((a, b) => (b.fechaHoraPedido ?? '').localeCompare(a.fechaHoraPedido ?? '')
        || b.idOrigen.localeCompare(a.idOrigen)
        || Number(a.identificadorDetalle ?? 0) - Number(b.identificadorDetalle ?? 0));
    const inicio = (filtros.pagina - 1) * filtros.cantidadPorPagina;
    const registros = todos.slice(inicio, inicio + filtros.cantidadPorPagina);
    await Promise.all([
      this.agregarResponsablesArticulos(registros),
      this.agregarIngresosHistorial(registros),
      this.seguimientoRepositorio?.aplicarArticulos(registros) ?? Promise.resolve(),
    ]);
    return { registros, pagina: filtros.pagina, cantidadPorPagina: filtros.cantidadPorPagina,
      totalRegistros: (r1?.totalRegistros ?? 0) + (sap?.totalRegistros ?? 0) + (entregas?.totalRegistros ?? 0),
      hayMas: Boolean(r1?.hayMas || sap?.hayMas || entregas?.hayMas || todos.length > inicio + registros.length) };
  }

  private compartirConsulta<T extends ResultadoListadoHistorial>(
    tipo: 'pedidos' | 'articulos',
    filtros: FiltrosHistorial,
    consultar: () => Promise<T>,
  ): Promise<T> {
    const clave = claveFiltrosHistorial(tipo, filtros);
    const instante = this.ahora();
    const existente = this.consultasCompartidas.get(clave);
    if (existente && (existente.expiraEn === null || existente.expiraEn > instante)) {
      return existente.promesa as Promise<T>;
    }
    if (existente) this.consultasCompartidas.delete(clave);

    const entrada: ConsultaHistorialCompartida = {
      promesa: Promise.resolve().then(consultar),
      expiraEn: null,
    };
    this.consultasCompartidas.set(clave, entrada);
    void entrada.promesa.then(() => {
      if (this.consultasCompartidas.get(clave) !== entrada) return;
      entrada.expiraEn = this.ahora() + this.duracionCacheMs;
      this.depurarConsultasCompartidas();
    }, () => {
      if (this.consultasCompartidas.get(clave) === entrada) {
        this.consultasCompartidas.delete(clave);
      }
    });
    this.depurarConsultasCompartidas();
    return entrada.promesa as Promise<T>;
  }

  private depurarConsultasCompartidas(): void {
    const instante = this.ahora();
    for (const [clave, entrada] of this.consultasCompartidas) {
      if (entrada.expiraEn !== null && entrada.expiraEn <= instante) {
        this.consultasCompartidas.delete(clave);
      }
    }
    if (this.consultasCompartidas.size <= maximoConsultasCacheadas) return;
    for (const [clave, entrada] of this.consultasCompartidas) {
      if (entrada.expiraEn !== null) this.consultasCompartidas.delete(clave);
      if (this.consultasCompartidas.size <= maximoConsultasCacheadas) break;
    }
  }

  private async aplicarCierres(registros: Array<PedidoHistorial | PaginaArticulosHistorial['registros'][number]>): Promise<void> {
    const pedidos = registros.filter(p => !p.entregaSap && p.estadoHistorial !== 'Facturado');
    if (!pedidos.length) return;
    const estados = await this.repositorio.obtenerEstadosSinFactura(pedidos.map(p => p.numeroPedido));
    for (const pedido of pedidos) {
      const estado = estados.get(pedido.numeroPedido);
      if (estado) pedido.estadoHistorial = estado;
    }
  }

  private async agregarReceptorDevolucion(pedido: PedidoHistorial): Promise<void> {
    if (pedido.estadoHistorial !== 'CERRADO' && pedido.estadoHistorial !== 'DEVUELTO') return;
    const obtenerReceptor = this.repositorio.obtenerReceptorDevolucion;
    pedido.recibidoPor = typeof obtenerReceptor === 'function'
      ? await obtenerReceptor.call(this.repositorio, pedido.idOrigen)
      : null;
  }

  private async agregarIngresosHistorial(
    registros: Array<PedidoHistorial | PaginaArticulosHistorial['registros'][number]>,
  ): Promise<void> {
    if (registros.length === 0) return;
    const ingresos = await this.repositorio.registrarIngresosHistorial(
      registros.map(({ idOrigen }) => idOrigen),
    );
    for (const registro of registros) {
      registro.historialIngresadoEn = ingresos.get(registro.idOrigen) ?? null;
    }
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
