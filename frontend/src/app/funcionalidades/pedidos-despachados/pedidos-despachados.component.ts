import { HttpClient, HttpParams } from '@angular/common/http';
import { Component, DestroyRef, HostListener, Injector, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SelectorAlmacenesDirective } from '../../compartido/interaccion/selector-almacenes.directive';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subject, catchError, exhaustMap, filter, finalize, forkJoin, map, merge, of, tap, timer } from 'rxjs';
import { environment } from '../../../environments/environment';
import { DetallePedidoVistaComponent } from '../../compartido/detalle-pedido/detalle-pedido-vista.component';
import type {
  ConfiguracionDetallePedido,
  ErrorDetalleVisual,
  PedidoDetalleVisual,
} from '../../compartido/detalle-pedido/detalle-pedido-vista.interface';
import type { PedidoResumen } from '../pedidos/pedido.interface';
import type { Almacen } from '../pedidos/almacen.interface';
import { AlmacenesService } from '../pedidos/almacenes.service';
import { esFechaCalendarioValida, guardarFiltrosSesion, leerFiltrosSesion, obtenerFechaLocalActual } from '../../compartido/estado-filtros-sesion';
import { formatearFechaHoraHonduras } from '../../compartido/fechas/fecha-honduras';
import { FiltrosGlobalesService } from '../../compartido/filtros-globales.service';
import { CodigoArticuloInventarioDirective } from '../../compartido/inventario/codigo-articulo-inventario.directive';
import { PaginacionComponent } from '../../compartido/paginacion/paginacion.component';
import { duracionPedidoMs, formatearDuracionPedido } from '../../compartido/tiempo-pedido';
import { AccionSeleccionDetalleComponent } from '../../compartido/detalle-pedido/controles-seleccion-detalle.component';
import { VistaImpresionPedidoComponent, type ArticuloImpresionPedido } from '../pedidos/vista-impresion-pedido.component';
import { ConfirmacionImpresionComponent } from '../../compartido/impresiones/confirmacion-impresion.component';
import { ImpresionesService } from '../../compartido/impresiones/impresiones.service';
import type { LineaRegistroImpresion } from '../../compartido/impresiones/impresion.interface';
import { ImpresionPedidoPosService } from '../pedidos/impresion-pedido-pos.service';

interface Despachado extends PedidoResumen {
  estadoLocal: 'DESPACHADO';
  despachadoEn: string;
  usuarioDespacho: string;
  esParcial?: boolean | null;
}

interface FiltrosDespachados {
  numeroPedido: string;
  fechaDesde: string;
  fechaHasta: string;
  codigosAlmacen: string[];
  cantidadPorPagina: 25 | 50 | 100;
}

interface RespuestaListadoDespachados {
  datos: Despachado[];
  paginacion?: {
    hayMas?: boolean;
    totalRegistros?: number;
  };
}

interface GrupoDespachados {
  clave: 'normales' | 'especiales';
  titulo: string;
  pedidos: Despachado[];
  pagina: number;
  totalRegistros: number;
}

const claveFiltrosDespachados = 'pedidosDespachados';
const intervaloActualizacionDespachadosMs = 15000;
type VistaDespachados = 'articulos' | 'pedido';
const filtrosIniciales = (): FiltrosDespachados => ({
  numeroPedido: '', fechaDesde: obtenerFechaLocalActual(), fechaHasta: obtenerFechaLocalActual(),
  codigosAlmacen: [], cantidadPorPagina: 25,
});

@Component({
  selector: 'app-pedidos-despachados',
  imports: [FormsModule, RouterLink, DetallePedidoVistaComponent, CodigoArticuloInventarioDirective,
    PaginacionComponent, SelectorAlmacenesDirective, AccionSeleccionDetalleComponent,
    VistaImpresionPedidoComponent, ConfirmacionImpresionComponent],
  templateUrl: './pedidos-despachados.component.html',
  styleUrl: '../pedidos/lista-pedidos.component.css',
})
export class PedidosDespachadosComponent implements OnInit {
  private readonly clienteHttp = inject(HttpClient);
  private readonly almacenesServicio = inject(AlmacenesService);
  private readonly ruta = inject(ActivatedRoute);
  private readonly enrutador = inject(Router);
  private readonly destruirRef = inject(DestroyRef);
  private readonly filtrosGlobales = inject(FiltrosGlobalesService);
  private readonly inyector = inject(Injector);
  private readonly impresionPedidoPos = inject(ImpresionPedidoPosService);
  private readonly actualizarAhora = new Subject<boolean>();
  private haCargado = false;
  private consultaEnCurso = false;
  private actualizacionManualPendiente = false;
  private temporizadorImpresion?: ReturnType<typeof setTimeout>;
  private loteImpresion: LineaRegistroImpresion[] | null = null;
  private esperandoCierreImpresion = false;
  public filtros = filtrosIniciales();
  public readonly pagina = signal(1);
  public readonly paginaEspeciales = signal(1);
  public readonly hayMas = signal(false);
  public readonly totalRegistros = signal(0);
  public readonly totalRegistrosEspeciales = signal(0);
  public readonly almacenes = signal<Almacen[]>([]);
  public readonly pedidos = signal<Despachado[]>([]);
  public readonly pedidosEspeciales = signal<Despachado[]>([]);
  public readonly grupos = computed<GrupoDespachados[]>(() => [
    { clave: 'normales', titulo: 'Pedidos Normales', pedidos: this.pedidos(),
      pagina: this.pagina(), totalRegistros: this.totalRegistros() },
    { clave: 'especiales', titulo: 'Pedidos Especiales', pedidos: this.pedidosEspeciales(),
      pagina: this.paginaEspeciales(), totalRegistros: this.totalRegistrosEspeciales() },
  ]);
  public readonly vista = signal<VistaDespachados>('articulos');
  public readonly idOrigen = signal<string | null>(null);
  public readonly cargando = signal(true);
  public readonly actualizando = signal(false);
  public readonly ultimaActualizacion = signal<Date | null>(null);
  public readonly error = signal(false);
  public readonly lineasSeleccionadasImpresion = signal<ReadonlySet<string>>(new Set());
  public readonly articulosImpresion = signal<readonly ArticuloImpresionPedido[]>([]);
  public readonly fechaHoraImpresion = signal('');
  public readonly preparandoImpresion = signal(false);
  public readonly confirmarImpresion = signal(false);
  public readonly guardandoImpresion = signal(false);
  public readonly errorRegistroImpresion = signal('');
  public readonly configuracionDetalle = computed<ConfiguracionDetallePedido>(() => {
    const pedido = this.pedidos()[0];
    return {
      contexto: 'Registro local',
      titulo: 'Detalle del pedido despachado',
      descripcion: 'Datos del pedido despachado.',
      etiquetaEstado: pedido?.esParcial === true ? 'Despacho parcial' : 'Despachado',
      severidadEstado: pedido?.esParcial === true ? 'advertencia' : 'exito',
      etiquetaRetorno: 'Regresar a pedidos despachados',
      tituloInformacion: 'Información de entrega',
      etiquetaArticulos: 'Artículos despachados del pedido',
      permitirImpresion: true,
      aviso: pedido?.esParcial === true
        ? 'Despacho parcial: este pedido todavía conserva líneas pendientes.'
        : null,
    };
  });
  public readonly errorDetalle = computed<ErrorDetalleVisual | null>(() =>
    this.error() && this.idOrigen()
      ? { titulo: 'No pudimos cargar el pedido', detalle: 'Probá de nuevo.' }
      : null);
  public readonly detalleVisual = computed<PedidoDetalleVisual | null>(() => {
    if (!this.idOrigen()) return null;
    const pedido = this.pedidos()[0];
    if (!pedido) return null;
    return {
      idOrigen: pedido.idOrigen,
      numeroPedido: pedido.numeroPedido,
      vendedor: pedido.nombreVendedor,
      fechaPedido: pedido.fechaHoraPedido,
      bodega: pedido.nombresBodega,
      datosOperativos: [
        { etiqueta: 'Fecha de despacho', valor: pedido.despachadoEn, icono: 'pi pi-calendar-clock', esFecha: true },
        { etiqueta: 'Usuario que despachó', valor: pedido.usuarioDespacho, icono: 'pi pi-user' },
        { etiqueta: 'Bodegas', valor: pedido.codigosAlmacen?.join(', ') || null, icono: 'pi pi-map-marker' },
        { etiqueta: 'Tipo de despacho', valor: pedido.esParcial === true ? 'Parcial' : 'Completo', icono: 'pi pi-check-circle' },
        { etiqueta: 'Tiempo total de despacho', valor: this.tiempoTotalDespacho(pedido), icono: 'pi pi-stopwatch' },
      ],
      modificaciones: pedido.modificaciones ?? [],
      articulos: pedido.articulos.map((articulo, indice) => ({
        clave: articulo.identificadorDetalle ?? `${articulo.codigoArticulo ?? 'articulo'}-${indice}`,
        identificadorDetalle: articulo.identificadorDetalle,
        codigo: articulo.codigoArticulo,
        descripcion: articulo.descripcion,
        cantidad: articulo.cantidad,
        codigoAlmacen: articulo.codigoAlmacen,
        nombreAlmacen: articulo.nombreAlmacen,
        fechaDespacho: articulo.transferidoEn ?? pedido.despachadoEn,
        usuario: articulo.usuarioAsignado ?? null,
      })),
    };
  });

  public ngOnInit(): void {
    this.destruirRef.onDestroy(() => {
      clearTimeout(this.temporizadorImpresion);
      this.impresionPedidoPos.finalizar();
    });
    const idOrigen = this.ruta.snapshot.paramMap.get('idOrigen');
    this.idOrigen.set(idOrigen);
    if (idOrigen) {
      this.cargarDetalle(idOrigen);
      return;
    }

    this.hidratarFiltros();
    this.cargarAlmacenes();
    this.iniciarActualizacionAutomatica();
    this.actualizarAhora.next(false);
  }

  private consultarListado(clasificacion: 'normal' | 'especial', pagina: number) {
    let parametros = new HttpParams()
      .set('pagina', pagina)
      .set('cantidadPorPagina', this.filtros.cantidadPorPagina)
      .set('fechaDesde', this.filtros.fechaDesde)
      .set('fechaHasta', this.filtros.fechaHasta)
      .set('vista', this.vista())
      .set('clasificacion', clasificacion);
    if (this.filtros.numeroPedido.trim()) {
      parametros = parametros.set('numeroPedido', this.filtros.numeroPedido.trim());
    }
    for (const codigo of this.filtros.codigosAlmacen) {
      parametros = parametros.append('codigoAlmacen', codigo);
    }
    return this.clienteHttp.get<RespuestaListadoDespachados>(
      `${environment.urlApi}/pedidos-despachados`,
      { params: parametros },
    );
  }

  private iniciarActualizacionAutomatica(): void {
    merge(
      this.actualizarAhora,
      timer(intervaloActualizacionDespachadosMs, intervaloActualizacionDespachadosMs).pipe(map(() => true)),
    ).pipe(
      tap((esAutomatica) => {
        if (this.consultaEnCurso && !esAutomatica) this.actualizacionManualPendiente = true;
      }),
      filter(() => !this.consultaEnCurso),
      exhaustMap((esAutomatica) => {
        this.consultaEnCurso = true;
        if (!this.haCargado || !esAutomatica) this.cargando.set(true);
        else this.actualizando.set(true);
        if (!esAutomatica) this.error.set(false);
        return forkJoin({
          normales: this.consultarListado('normal', this.pagina()).pipe(catchError(() => of(null))),
          especiales: this.consultarListado('especial', this.paginaEspeciales()).pipe(catchError(() => of(null))),
        }).pipe(
          map((respuestas) => ({ respuestas, esAutomatica })),
          finalize(() => {
            this.consultaEnCurso = false;
            this.cargando.set(false);
            this.actualizando.set(false);
            if (this.actualizacionManualPendiente) {
              this.actualizacionManualPendiente = false;
              queueMicrotask(() => this.actualizarAhora.next(false));
            }
          }),
        );
      }),
      takeUntilDestroyed(this.destruirRef),
    ).subscribe(({ respuestas, esAutomatica }) => {
      if (!respuestas.normales && !respuestas.especiales) {
        if (!this.haCargado || !esAutomatica) this.marcarError();
        return;
      }
      if (respuestas.normales) {
        const paginacion = respuestas.normales.paginacion;
        this.hayMas.set(Boolean(paginacion?.hayMas));
        this.totalRegistros.set(paginacion?.totalRegistros ?? respuestas.normales.datos.length);
        this.pedidos.set(respuestas.normales.datos);
      }
      if (respuestas.especiales) {
        const paginacion = respuestas.especiales.paginacion;
        this.totalRegistrosEspeciales.set(
          paginacion?.totalRegistros ?? respuestas.especiales.datos.length,
        );
        this.pedidosEspeciales.set(respuestas.especiales.datos);
      }
      this.reconciliarSeleccionImpresion();
      this.error.set(false);
      this.ultimaActualizacion.set(new Date());
      this.haCargado = true;
    });
  }

  public buscar(): void { this.guardarFiltros(); this.actualizarListado(1, 1); }
  public limpiarFiltros(): void { this.filtros = filtrosIniciales(); this.actualizarListado(1, 1); }
  public cambiarCantidadPorPagina(): void { this.actualizarListado(1, 1); }
  public cambiarVista(vista: VistaDespachados): void {
    if (this.vista() === vista) return;
    this.vista.set(vista);
    this.actualizarListado(1, 1);
  }
  public estaSeleccionado(codigo: string): boolean { return this.filtros.codigosAlmacen.includes(codigo); }
  public alternarAlmacen(codigo: string, seleccionado: boolean): void {
    this.filtros.codigosAlmacen = seleccionado
      ? [...new Set([...this.filtros.codigosAlmacen, codigo])]
      : this.filtros.codigosAlmacen.filter((actual) => actual !== codigo);
    this.guardarFiltros();
  }
  public quitarAlmacen(codigo: string): void { this.alternarAlmacen(codigo, false); }
  public limpiarAlmacenes(): void {
    this.filtros.codigosAlmacen = [];
    this.guardarFiltros();
  }
  public nombreAlmacen(codigo: string): string {
    return this.almacenes().find((almacen) => almacen.codigoAlmacen === codigo)?.nombreAlmacen || codigo;
  }
  public resumenAlmacenes(): string {
    const cantidad = this.filtros.codigosAlmacen.length;
    return cantidad === 0 ? 'Todos los almacenes'
      : cantidad === 1 ? this.filtros.codigosAlmacen[0]! : `${cantidad} almacenes seleccionados`;
  }

  public estaSeleccionadoParaImpresion(
    pedido: Despachado,
    articulo: Despachado['articulos'][number],
  ): boolean {
    return this.lineasSeleccionadasImpresion().has(this.claveImpresion(pedido, articulo));
  }

  public alternarSeleccionImpresion(
    pedido: Despachado,
    articulo: Despachado['articulos'][number],
    seleccionado: boolean,
  ): void {
    if (!articulo.identificadorDetalle?.trim() || this.preparandoImpresion()
      || this.confirmarImpresion() || this.guardandoImpresion()) return;
    const seleccion = new Set(this.lineasSeleccionadasImpresion());
    const clave = this.claveImpresion(pedido, articulo);
    if (seleccionado) seleccion.add(clave); else seleccion.delete(clave);
    this.lineasSeleccionadasImpresion.set(seleccion);
  }

  public todasImpresionesSeleccionadas(grupo: GrupoDespachados['clave']): boolean {
    const disponibles = this.pedidosGrupo(grupo).flatMap((pedido) => pedido.articulos
      .filter((articulo) => articulo.identificadorDetalle?.trim())
      .map((articulo) => this.claveImpresion(pedido, articulo)));
    return disponibles.length > 0
      && disponibles.every((clave) => this.lineasSeleccionadasImpresion().has(clave));
  }

  public seleccionarTodasImpresiones(grupo: GrupoDespachados['clave']): void {
    if (this.preparandoImpresion() || this.confirmarImpresion() || this.guardandoImpresion()) return;
    const disponibles = this.pedidosGrupo(grupo).flatMap((pedido) => pedido.articulos
      .filter((articulo) => articulo.identificadorDetalle?.trim())
      .map((articulo) => this.claveImpresion(pedido, articulo)));
    const seleccionar = !this.todasImpresionesSeleccionadas(grupo);
    const seleccion = new Set(this.lineasSeleccionadasImpresion());
    disponibles.forEach((clave) => seleccionar ? seleccion.add(clave) : seleccion.delete(clave));
    this.lineasSeleccionadasImpresion.set(seleccion);
  }

  public pedidoSeleccionadoParaImpresion(pedido: Despachado): boolean {
    const disponibles = pedido.articulos.filter((articulo) => articulo.identificadorDetalle?.trim());
    return disponibles.length > 0
      && disponibles.every((articulo) => this.estaSeleccionadoParaImpresion(pedido, articulo));
  }

  public alternarPedidoImpresion(pedido: Despachado, seleccionado: boolean): void {
    if (this.preparandoImpresion() || this.confirmarImpresion() || this.guardandoImpresion()) return;
    const seleccion = new Set(this.lineasSeleccionadasImpresion());
    pedido.articulos.filter((articulo) => articulo.identificadorDetalle?.trim())
      .forEach((articulo) => seleccionado
        ? seleccion.add(this.claveImpresion(pedido, articulo))
        : seleccion.delete(this.claveImpresion(pedido, articulo)));
    this.lineasSeleccionadasImpresion.set(seleccion);
  }

  public imprimirSeleccionados(): void {
    if (this.preparandoImpresion() || this.confirmarImpresion() || this.guardandoImpresion()) return;
    const elegidos = this.lineasImpresionVisibles().filter(({ pedido, articulo }) =>
      articulo.identificadorDetalle?.trim()
      && this.lineasSeleccionadasImpresion().has(this.claveImpresion(pedido, articulo)));
    if (elegidos.length === 0) return;
    this.loteImpresion = elegidos.map(({ pedido, articulo }) => ({
      idOrigen: pedido.idOrigen,
      identificadorDetalle: articulo.identificadorDetalle!.trim(),
      codigoArticulo: articulo.codigoArticulo?.trim() || null,
    }));
    this.articulosImpresion.set(this.impresionPedidoPos.preparar(elegidos.map(({ pedido, articulo }) => ({
      idPedido: pedido.idOrigen,
      numeroPedido: pedido.numeroPedido,
      codigo: articulo.codigoArticulo?.trim() || '—',
      descripcion: articulo.descripcion?.trim() || '—',
      cantidad: articulo.cantidad,
      bodega: articulo.codigoAlmacen?.trim() || '—',
      vendedor: pedido.nombreVendedor?.trim() || 'Sin vendedor',
      asignadoA: articulo.usuarioAsignado?.trim() || 'Sin asignar',
    }))));
    this.fechaHoraImpresion.set(formatearFechaHoraHonduras(new Date(), true));
    this.errorRegistroImpresion.set('');
    this.preparandoImpresion.set(true);
    this.temporizadorImpresion = setTimeout(() => {
      this.esperandoCierreImpresion = true;
      try { this.impresionPedidoPos.imprimir(); } catch { this.descartarRegistroImpresion(); }
    });
  }

  @HostListener('window:afterprint')
  public alCerrarImpresion(): void {
    if (!this.esperandoCierreImpresion || !this.loteImpresion) return;
    this.impresionPedidoPos.finalizar();
    this.esperandoCierreImpresion = false;
    this.preparandoImpresion.set(false);
    this.confirmarImpresion.set(true);
  }

  public descartarRegistroImpresion(): void {
    if (this.guardandoImpresion()) return;
    this.impresionPedidoPos.finalizar();
    clearTimeout(this.temporizadorImpresion);
    this.esperandoCierreImpresion = false;
    this.loteImpresion = null;
    this.confirmarImpresion.set(false);
    this.preparandoImpresion.set(false);
    this.errorRegistroImpresion.set('');
  }

  public registrarImpresionConfirmada(): void {
    const lote = this.loteImpresion;
    if (!lote || !this.confirmarImpresion() || this.guardandoImpresion()) return;
    this.guardandoImpresion.set(true);
    this.errorRegistroImpresion.set('');
    this.inyector.get(ImpresionesService).registrar(lote)
      .pipe(takeUntilDestroyed(this.destruirRef))
      .subscribe({
        next: () => {
          const seleccion = new Set(this.lineasSeleccionadasImpresion());
          lote.forEach(({ idOrigen, identificadorDetalle }) =>
            seleccion.delete(`${idOrigen}\u0000${identificadorDetalle}`));
          this.lineasSeleccionadasImpresion.set(seleccion);
          this.guardandoImpresion.set(false);
          this.descartarRegistroImpresion();
        },
        error: () => {
          this.guardandoImpresion.set(false);
          this.errorRegistroImpresion.set('No se pudo guardar el registro de impresión. Intentá de nuevo.');
        },
      });
  }

  private pedidosGrupo(grupo: GrupoDespachados['clave']): Despachado[] {
    return grupo === 'normales' ? this.pedidos() : this.pedidosEspeciales();
  }

  private lineasImpresionVisibles(): { pedido: Despachado; articulo: Despachado['articulos'][number] }[] {
    return [...this.pedidos(), ...this.pedidosEspeciales()].flatMap((pedido) =>
      pedido.articulos.map((articulo) => ({ pedido, articulo })));
  }

  private claveImpresion(
    pedido: Despachado,
    articulo: Despachado['articulos'][number],
  ): string {
    return `${pedido.idOrigen}\u0000${articulo.identificadorDetalle?.trim() ?? ''}`;
  }

  private limpiarSeleccionImpresion(): void {
    this.lineasSeleccionadasImpresion.set(new Set());
  }

  private reconciliarSeleccionImpresion(): void {
    const visibles = new Set(this.lineasImpresionVisibles()
      .filter(({ articulo }) => articulo.identificadorDetalle?.trim())
      .map(({ pedido, articulo }) => this.claveImpresion(pedido, articulo)));
    this.lineasSeleccionadasImpresion.set(new Set(
      [...this.lineasSeleccionadasImpresion()].filter((clave) => visibles.has(clave)),
    ));
  }

  public irPagina(grupo: 'normales' | 'especiales', pagina: number): void {
    if (this.cargando()) return;
    this.actualizarListado(
      grupo === 'normales' ? pagina : this.pagina(),
      grupo === 'especiales' ? pagina : this.paginaEspeciales(),
    );
  }

  public responsablesPedido(pedido: Despachado): string {
    const responsables = pedido.responsablesAsignados ?? [...new Set(pedido.articulos
      .flatMap(({ usuarioAsignado }) => usuarioAsignado ? [usuarioAsignado] : []))];
    return responsables.length > 0 ? responsables.join(', ') : '—';
  }

  public tiempoTotalDespacho(pedido: Despachado, fin?: string | null): string {
    return formatearDuracionPedido(duracionPedidoMs(pedido, fin ?? pedido.despachadoEn));
  }

  public modificadoPor(pedido: Despachado): string {
    return pedido.modificado ? pedido.modificadoPor?.trim() || 'No disponible' : '—';
  }

  private actualizarListado(pagina: number, paginaEspeciales: number): void {
    this.limpiarSeleccionImpresion();
    this.pagina.set(pagina); this.paginaEspeciales.set(paginaEspeciales);
    this.guardarFiltros(); this.actualizarUrl();
    this.cargando.set(true); this.error.set(false); this.actualizarAhora.next(false);
  }

  private actualizarUrl(): void {
    const queryParams: Record<string, string | number | string[]> = {
      pagina: this.pagina(), cantidadPorPagina: this.filtros.cantidadPorPagina,
      paginaEspeciales: this.paginaEspeciales(),
      fechaDesde: this.filtros.fechaDesde, fechaHasta: this.filtros.fechaHasta,
      vista: this.vista(),
    };
    if (this.filtros.numeroPedido.trim()) queryParams['numeroPedido'] = this.filtros.numeroPedido.trim();
    if (this.filtros.codigosAlmacen.length) queryParams['codigoAlmacen'] = this.filtros.codigosAlmacen;
    void this.enrutador.navigate([], { relativeTo: this.ruta, queryParams, replaceUrl: true });
  }

  private hidratarFiltros(): void {
    const parametros = this.ruta.snapshot.queryParamMap;
    const guardados = leerFiltrosSesion(claveFiltrosDespachados);
    const globales = this.filtrosGlobales.obtener();
    const fechaActual = obtenerFechaLocalActual();
    const codigosUrl = parametros.getAll('codigoAlmacen').map((codigo) => codigo.trim()).filter(Boolean);
    const cantidad = Number(parametros.get('cantidadPorPagina') ?? guardados['cantidadPorPagina']);
    this.filtros = {
      numeroPedido: parametros.get('numeroPedido') ?? (typeof guardados['numeroPedido'] === 'string' ? guardados['numeroPedido'] : ''),
      fechaDesde: esFechaCalendarioValida(parametros.get('fechaDesde')) ? parametros.get('fechaDesde')! : fechaActual,
      fechaHasta: esFechaCalendarioValida(parametros.get('fechaHasta')) ? parametros.get('fechaHasta')! : fechaActual,
      codigosAlmacen: [...new Set(codigosUrl.length ? codigosUrl : globales.codigosAlmacen)],
      cantidadPorPagina: cantidad === 50 || cantidad === 100 ? cantidad : 25,
    };
    this.vista.set(parametros.get('vista') === 'pedido' ? 'pedido' : 'articulos');
    this.pagina.set(Math.max(1, Number(parametros.get('pagina') ?? guardados['pagina']) || 1));
    this.paginaEspeciales.set(Math.max(1,
      Number(parametros.get('paginaEspeciales') ?? guardados['paginaEspeciales']) || 1));
    this.guardarFiltros(); this.actualizarUrl();
  }

  private guardarFiltros(): void {
    this.filtrosGlobales.actualizar({ fechaDesde: this.filtros.fechaDesde,
      fechaHasta: this.filtros.fechaHasta, codigosAlmacen: this.filtros.codigosAlmacen });
    guardarFiltrosSesion(claveFiltrosDespachados, { ...this.filtros, pagina: this.pagina(),
      paginaEspeciales: this.paginaEspeciales() });
  }

  private cargarAlmacenes(): void {
    this.almacenesServicio.obtenerAlmacenes().pipe(takeUntilDestroyed(this.destruirRef)).subscribe({
      next: ({ datos }) => this.almacenes.set(datos), error: () => this.almacenes.set([]),
    });
  }

  public regresar(): void {
    const retorno = this.ruta.snapshot.queryParamMap.get('retorno');
    void this.enrutador.navigateByUrl(
      retorno === '/pedidos-despachados' || retorno?.startsWith('/pedidos-despachados?')
        ? retorno
        : '/pedidos-despachados',
    );
  }

  public rutaRetorno(): string {
    return this.enrutador.url === '/pedidos-despachados'
      || this.enrutador.url.startsWith('/pedidos-despachados?')
      ? this.enrutador.url
      : '/pedidos-despachados';
  }

  public fecha(valor: string | Date | null | undefined): string {
    return formatearFechaHoraHonduras(valor);
  }

  public reintentarDetalle(): void {
    const idOrigen = this.idOrigen();
    if (!idOrigen) return;
    this.error.set(false);
    this.cargando.set(true);
    this.cargarDetalle(idOrigen);
  }

  private cargarDetalle(idOrigen: string): void {
    this.clienteHttp.get<{ datos: Despachado }>(
      `${environment.urlApi}/pedidos-despachados/${encodeURIComponent(idOrigen)}`,
    ).pipe(takeUntilDestroyed(this.destruirRef))
      .subscribe({ next: ({ datos }) => this.finalizarCarga([datos]), error: () => this.marcarError() });
  }

  private finalizarCarga(pedidos: Despachado[]): void {
    this.pedidos.set(pedidos);
    this.cargando.set(false);
  }

  private marcarError(): void {
    this.error.set(true);
    this.cargando.set(false);
  }
}
