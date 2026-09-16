import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { SelectorAlmacenesDirective } from '../../compartido/interaccion/selector-almacenes.directive';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, forkJoin, of, type Observable } from 'rxjs';
import { DetallePedidoVistaComponent } from '../../compartido/detalle-pedido/detalle-pedido-vista.component';
import type {
  ConfiguracionDetallePedido,
  PedidoDetalleVisual,
} from '../../compartido/detalle-pedido/detalle-pedido-vista.interface';
import type { MensajeError } from '../../compartido/error-api.interface';
import { obtenerMensajeError } from '../../compartido/manejar-error-http';
import { esFechaCalendarioValida, guardarFiltrosSesion, leerFiltrosSesion, obtenerFechaLocalActual } from '../../compartido/estado-filtros-sesion';
import { formatearFechaHoraHonduras } from '../../compartido/fechas/fecha-honduras';
import { FiltrosGlobalesService } from '../../compartido/filtros-globales.service';
import type { ArticuloHistorial, HistorialValidado, RespuestaArticulosHistorial, RespuestaHistorial } from './historial.interface';
import { HistorialService } from './historial.service';
import type { Almacen } from '../pedidos/almacen.interface';
import { AlmacenesService } from '../pedidos/almacenes.service';
import { CodigoArticuloInventarioDirective } from '../../compartido/inventario/codigo-articulo-inventario.directive';
import { PaginacionComponent } from '../../compartido/paginacion/paginacion.component';

const claveFiltrosHistorial = 'historial';
const intervaloActualizacionHistorialMs = 15000;

interface FiltrosHistorialGuardados {
  fechaDesde?: string;
  fechaHasta?: string;
  numeroPedido?: string;
  codigosAlmacen?: string[];
  vista?: VistaHistorial;
  pagina?: number;
  paginaEspeciales?: number;
  cantidadPorPagina?: number;
}
type VistaHistorial = 'pedido' | 'articulos';

@Component({
  selector: 'app-historial',
  imports: [FormsModule, RouterLink, DetallePedidoVistaComponent,
    CodigoArticuloInventarioDirective, PaginacionComponent, SelectorAlmacenesDirective],
  templateUrl: './historial.component.html',
  styleUrls: ['../pedidos/lista-pedidos.component.css', './historial.component.css'],
})
export class HistorialComponent implements OnInit {
  private readonly servicio = inject(HistorialService);
  private readonly almacenesServicio = inject(AlmacenesService);
  private readonly destruirRef = inject(DestroyRef);
  private readonly ruta = inject(ActivatedRoute);
  private readonly enrutador = inject(Router);
  private readonly filtrosGlobales = inject(FiltrosGlobalesService);
  private temporizador?: ReturnType<typeof setInterval>;
  private haCargado = false;
  private recargaManualPendiente = false;
  public readonly idOrigen = signal<string | null>(null);
  public filtros = {
    fechaDesde: obtenerFechaLocalActual(),
    fechaHasta: obtenerFechaLocalActual(), numeroPedido: '', codigosAlmacen: [] as string[], cantidadPorPagina: 25,
  };
  public readonly almacenes = signal<Almacen[]>([]);
  public readonly registros = signal<HistorialValidado[]>([]);
  public readonly registrosEspeciales = signal<HistorialValidado[]>([]);
  public readonly articulos = signal<ArticuloHistorial[]>([]);
  public readonly articulosEspeciales = signal<ArticuloHistorial[]>([]);
  public readonly vista = signal<VistaHistorial>('articulos');
  public readonly pagina = signal(1);
  public readonly paginaEspeciales = signal(1);
  public readonly hayMas = signal(false);
  public readonly totalRegistros = signal(0);
  public readonly totalRegistrosEspeciales = signal(0);
  public readonly grupos = computed(() => [
    { clave: 'normales' as const, titulo: 'Pedidos Normales', pagina: this.pagina(),
      totalRegistros: this.totalRegistros(), pedidos: this.registros(), articulos: this.articulos() },
    { clave: 'especiales' as const, titulo: 'Pedidos Especiales', pagina: this.paginaEspeciales(),
      totalRegistros: this.totalRegistrosEspeciales(), pedidos: this.registrosEspeciales(),
      articulos: this.articulosEspeciales() },
  ]);
  public readonly cargando = signal(false);
  public readonly actualizando = signal(false);
  public readonly error = signal<MensajeError | null>(null);
  public readonly configuracionDetalle: ConfiguracionDetallePedido = {
    contexto: 'Historial',
    titulo: 'Detalle del pedido',
    descripcion: 'Revisá los artículos y los datos de entrega.',
    etiquetaEstado: 'Facturado',
    severidadEstado: 'exito',
    etiquetaRetorno: 'Regresar al historial',
    tituloInformacion: 'Datos de entrega',
    etiquetaArticulos: 'Artículos entregados',
    permitirImpresion: false,
  };
  public readonly detalleVisual = computed<PedidoDetalleVisual | null>(() => {
    if (!this.idOrigen()) return null;
    const pedido = this.registros()[0];
    if (!pedido) return null;
    return {
      idOrigen: pedido.idOrigen,
      tipoDocumento: pedido.entregaSap ? 'Entrega SAP' : undefined,
      auditoriaSap: pedido.estadoHistorial === 'Entregado, Sin factura' ? pedido.auditoriaSap : undefined,
      numeroPedido: pedido.numeroPedido,
      vendedor: pedido.nombreVendedor,
      fechaPedido: pedido.fechaHoraPedido,
      bodega: pedido.nombresBodega,
      datosOperativos: pedido.entregaSap ? [
        { etiqueta: 'Tipo', valor: pedido.entregaSap.tipo, icono: 'pi pi-file' },
        { etiqueta: 'Entrega SAP', valor: pedido.entregaSap.docNum, icono: 'pi pi-file' },
        { etiqueta: 'DocEntry de entrega', valor: pedido.entregaSap.docEntry, icono: 'pi pi-file' },
        { etiqueta: 'Fecha de entrega', valor: pedido.entregaSap.fechaEntrega, icono: 'pi pi-calendar-clock', esFecha: true },
        { etiqueta: 'Pedido', valor: this.numerosBase(pedido, 17) || 'No aplica', icono: 'pi pi-file' },
        { etiqueta: 'Cotización', valor: this.numerosBase(pedido, 23) || 'No aplica', icono: 'pi pi-file' },
        { etiqueta: 'Referencia R1', valor: pedido.entregaSap.referenciaR1 || 'No aplica', icono: 'pi pi-file' },
        { etiqueta: 'Factura', valor: pedido.entregaSap.facturas.map(f => f.docNum).join(', ') || 'Sin factura', icono: 'pi pi-file' },
        { etiqueta: 'Asignado a', valor: this.responsablesPedido(pedido) === '—' ? 'Sin asignar' : this.responsablesPedido(pedido), icono: 'pi pi-user' },
        { etiqueta: 'Bodega', valor: pedido.codigosAlmacen.join(', '), icono: 'pi pi-map-marker' },
      ] : [
        { etiqueta: 'Fecha de despacho', valor: pedido.despachadoEn, icono: 'pi pi-calendar-clock', esFecha: true },
        { etiqueta: 'Fecha de entrega', valor: pedido.validadoDetectadoEn, icono: 'pi pi-check-circle', esFecha: true },
        { etiqueta: 'Asignado a', valor: this.responsablesPedido(pedido), icono: 'pi pi-user' },
        { etiqueta: 'Bodega', valor: pedido.codigosAlmacen.join(', ') || null, icono: 'pi pi-map-marker' },
      ].filter(({ valor }) => valor !== null && valor !== undefined && String(valor).trim() !== ''),
      modificaciones: pedido.modificaciones ?? [],
      articulos: pedido.articulos.map((articulo, indice) => ({
        clave: articulo.identificadorDetalle ?? `${articulo.codigoArticulo ?? 'articulo'}-${indice}`,
        identificadorDetalle: articulo.identificadorDetalle,
        codigo: articulo.codigoArticulo,
        descripcion: articulo.descripcion,
        cantidad: articulo.cantidad,
        codigoAlmacen: articulo.codigoAlmacen,
        nombreAlmacen: articulo.nombreAlmacen,
        responsable: articulo.usuarioAsignado ?? null,
      })),
    };
  });
  public readonly configuracionDetalleVisual = computed<ConfiguracionDetallePedido>(() => {
    const pedido = this.registros()[0];
    return pedido?.entregaSap ? { ...this.configuracionDetalle, titulo: 'Detalle de la entrega SAP',
      etiquetaEstado: pedido.estadoHistorial || 'Entregado, Sin factura',
      severidadEstado: pedido.estadoHistorial === 'Facturado' ? 'exito' : 'informacion' }
      : this.configuracionDetalle;
  });

  public numeroDocumento(pedido: HistorialValidado | ArticuloHistorial): string {
    return pedido.entregaSap ? `Entrega SAP ${pedido.entregaSap.docNum}` : pedido.numeroPedido;
  }
  private numerosBase(pedido: HistorialValidado, tipo: number): string {
    return [...new Set(pedido.entregaSap?.bases.filter(b => b.baseType === tipo)
      .flatMap(b => b.numeroDocumento ? [b.numeroDocumento] : []) ?? [])].join(', ');
  }

  public ngOnInit(): void {
    const idOrigen = this.ruta.snapshot.paramMap.get('idOrigen');
    this.idOrigen.set(idOrigen);
    if (idOrigen) {
      this.cargarDetalle(idOrigen);
      if (/^SAP:PAJARO_AZUL:15:[1-9]\d*$/.test(idOrigen)) {
        this.temporizador = setInterval(() => this.cargarDetalle(idOrigen, true), intervaloActualizacionHistorialMs);
        this.destruirRef.onDestroy(() => this.temporizador && clearInterval(this.temporizador));
      }
      return;
    }
    this.hidratarFiltros();
    this.cargarAlmacenes();
    this.cargar();
    this.temporizador = setInterval(() => this.cargar(true), intervaloActualizacionHistorialMs);
    this.destruirRef.onDestroy(() => this.temporizador && clearInterval(this.temporizador));
  }

  public buscar(): void {
    this.pagina.set(1);
    this.paginaEspeciales.set(1);
    this.guardarFiltros();
    this.actualizarUrl();
    this.cargar();
  }
  public cambiarCantidadPorPagina(): void {
    this.pagina.set(1);
    this.paginaEspeciales.set(1);
    this.guardarFiltros();
    this.actualizarUrl();
    this.cargar();
  }
  public cambiarVista(vista: VistaHistorial): void {
    if (this.vista() === vista) return;
    this.vista.set(vista); this.pagina.set(1); this.paginaEspeciales.set(1);
    this.haCargado = false; this.hayMas.set(false);
    if (vista === 'articulos') { this.articulos.set([]); this.articulosEspeciales.set([]); }
    else { this.registros.set([]); this.registrosEspeciales.set([]); }
    this.guardarFiltros(); this.actualizarUrl(); this.cargar();
  }
  public limpiarFiltros(): void {
    this.filtros = { fechaDesde: obtenerFechaLocalActual(), fechaHasta: obtenerFechaLocalActual(),
      numeroPedido: '', codigosAlmacen: [], cantidadPorPagina: 25 };
    this.pagina.set(1); this.paginaEspeciales.set(1);
    this.guardarFiltros(); this.actualizarUrl(); this.cargar();
  }
  public estaSeleccionado(codigoAlmacen: string): boolean {
    return this.filtros.codigosAlmacen.includes(codigoAlmacen);
  }
  public alternarAlmacen(codigoAlmacen: string, seleccionado: boolean): void {
    this.filtros.codigosAlmacen = seleccionado
      ? [...new Set([...this.filtros.codigosAlmacen, codigoAlmacen])]
      : this.filtros.codigosAlmacen.filter((codigo) => codigo !== codigoAlmacen);
    this.guardarFiltros();
  }
  public quitarAlmacen(codigoAlmacen: string): void {
    this.alternarAlmacen(codigoAlmacen, false);
  }
  public limpiarAlmacenes(): void {
    this.filtros.codigosAlmacen = [];
    this.guardarFiltros();
  }
  public nombreAlmacen(codigoAlmacen: string): string {
    return this.almacenes().find((almacen) => almacen.codigoAlmacen === codigoAlmacen)?.nombreAlmacen
      || codigoAlmacen;
  }
  public resumenAlmacenes(): string {
    const cantidad = this.filtros.codigosAlmacen.length;
    return cantidad === 0 ? 'Todos los almacenes'
      : cantidad === 1 ? this.filtros.codigosAlmacen[0]! : `${cantidad} almacenes seleccionados`;
  }
  public marcador(valor: string | null): string { return valor?.trim() || '—'; }
  public responsablesPedido(pedido: HistorialValidado): string {
    const responsables = pedido.responsablesAsignados ?? [...new Set(pedido.articulos
      .flatMap(({ usuarioAsignado }) => usuarioAsignado ? [usuarioAsignado] : []))];
    return responsables.length > 0 ? responsables.join(', ') : '—';
  }
  public irPagina(grupo: 'normales' | 'especiales', pagina: number): void {
    if (this.cargando()) return;
    if (grupo === 'normales') this.pagina.set(pagina); else this.paginaEspeciales.set(pagina);
    this.guardarFiltros(); this.actualizarUrl(); this.cargar();
  }
  public modificadoPor(pedido: { modificado?: boolean; modificadoPor?: string | null }): string {
    return pedido.modificado ? pedido.modificadoPor?.trim() || 'No disponible' : '—';
  }
  public fechaHora(valor: string | null, hora12 = false): string {
    return valor ? formatearFechaHoraHonduras(valor, hora12) : '—';
  }
  public regresar(): void {
    const retorno = this.ruta.snapshot.queryParamMap.get('retorno');
    void this.enrutador.navigateByUrl(retorno?.startsWith('/historial-validados?')
      ? retorno : '/historial-validados');
  }
  public reintentarDetalle(): void {
    const idOrigen = this.idOrigen();
    if (idOrigen) this.cargarDetalle(idOrigen);
  }
  public rutaRetorno(): string { return `/historial-validados?${this.parametrosActuales().toString()}`; }

  private hidratarFiltros(): void {
    const parametros = this.ruta.snapshot.queryParamMap;
    const guardados = this.leerFiltrosGuardados();
    const globales = this.filtrosGlobales.obtener();
    const fechaDesdeUrl = parametros.get('fechaDesde');
    const fechaHastaUrl = parametros.get('fechaHasta');
    this.filtros.fechaDesde = esFechaCalendarioValida(fechaDesdeUrl) ? fechaDesdeUrl : globales.fechaDesde;
    this.filtros.fechaHasta = esFechaCalendarioValida(fechaHastaUrl) ? fechaHastaUrl : globales.fechaHasta;
    this.filtros.numeroPedido = parametros.get('numeroPedido') || guardados.numeroPedido || '';
    const codigosUrl = parametros.getAll('codigoAlmacen')
      .map((codigo) => codigo.trim()).filter(Boolean);
    this.filtros.codigosAlmacen = codigosUrl.length > 0
      ? [...new Set(codigosUrl)] : globales.codigosAlmacen;
    const cantidad = Number(parametros.get('cantidadPorPagina') ?? guardados.cantidadPorPagina);
    if ([25, 50, 100].includes(cantidad)) this.filtros.cantidadPorPagina = cantidad;
    this.pagina.set(Math.max(1, Number(parametros.get('pagina') ?? guardados.pagina) || 1));
    this.paginaEspeciales.set(Math.max(1,
      Number(parametros.get('paginaEspeciales') ?? guardados.paginaEspeciales) || 1));
    const vista = parametros.get('vista') ?? guardados.vista;
    this.vista.set(vista === 'pedido' ? 'pedido' : 'articulos');
    this.guardarFiltros();
    this.actualizarUrl();
  }

  private parametrosActuales(): URLSearchParams {
    const parametros = new URLSearchParams({ fechaDesde: this.filtros.fechaDesde,
      fechaHasta: this.filtros.fechaHasta, pagina: String(this.pagina()),
      paginaEspeciales: String(this.paginaEspeciales()),
      cantidadPorPagina: String(this.filtros.cantidadPorPagina) });
    if (this.filtros.numeroPedido.trim()) parametros.set('numeroPedido', this.filtros.numeroPedido.trim());
    for (const codigoAlmacen of this.filtros.codigosAlmacen) parametros.append('codigoAlmacen', codigoAlmacen);
    parametros.set('vista', this.vista());
    return parametros;
  }

  private actualizarUrl(): void {
    const parametros = this.parametrosActuales();
    const queryParams: Record<string, string | string[]> = {};
    parametros.forEach((valor, clave) => {
      const existente = queryParams[clave];
      queryParams[clave] = existente === undefined ? valor
        : Array.isArray(existente) ? [...existente, valor] : [existente, valor];
    });
    void this.enrutador.navigate([], { relativeTo: this.ruta, queryParams, replaceUrl: true });
  }

  private cargar(esAutomatica = false): void {
    if (this.cargando() || this.actualizando()) {
      if (!esAutomatica) this.recargaManualPendiente = true;
      return;
    }
    if (this.haCargado) this.actualizando.set(true); else this.cargando.set(true);
    if (!esAutomatica) this.error.set(null);
    const vistaConsulta = this.vista();
    const consultar = (clasificacion: 'normal' | 'especial', pagina: number):
    Observable<RespuestaHistorial | RespuestaArticulosHistorial> => vistaConsulta === 'articulos'
      ? this.servicio.buscarArticulos({ ...this.filtros, pagina, clasificacion })
      : this.servicio.buscar({ ...this.filtros, pagina, clasificacion });
    forkJoin({
      normales: consultar('normal', this.pagina()).pipe(catchError(() => of(null))),
      especiales: consultar('especial', this.paginaEspeciales()).pipe(catchError(() => of(null))),
    })
      .pipe(takeUntilDestroyed(this.destruirRef)).subscribe({
        next: ({ normales, especiales }) => {
          if (!normales && !especiales) {
            if (!this.haCargado && this.vista() === vistaConsulta) {
              this.registros.set([]); this.registrosEspeciales.set([]);
              this.articulos.set([]); this.articulosEspeciales.set([]);
              this.totalRegistros.set(0); this.totalRegistrosEspeciales.set(0);
              this.error.set(obtenerMensajeError(null, 'historial'));
            }
            this.finalizarConsulta(vistaConsulta);
            return;
          }
          if (vistaConsulta === 'articulos') {
            if (normales) this.articulos.set(normales.datos as ArticuloHistorial[]);
            if (especiales) this.articulosEspeciales.set(especiales.datos as ArticuloHistorial[]);
          } else {
            if (normales) this.registros.set(normales.datos as HistorialValidado[]);
            if (especiales) this.registrosEspeciales.set(especiales.datos as HistorialValidado[]);
          }
          if (this.vista() === vistaConsulta) {
            if (normales) {
              this.hayMas.set(normales.paginacion.hayMas);
              this.totalRegistros.set(
                normales.paginacion.totalRegistros ?? normales.datos.length,
              );
            }
            if (especiales) this.totalRegistrosEspeciales.set(
              especiales.paginacion.totalRegistros ?? especiales.datos.length,
            );
            this.haCargado = true;
          } else {
            this.hayMas.set(false); this.haCargado = false;
          }
          this.finalizarConsulta(vistaConsulta);
        },
      });
  }

  private finalizarConsulta(vistaConsulta: VistaHistorial): void {
    this.cargando.set(false);
    this.actualizando.set(false);
    if (this.vista() !== vistaConsulta || this.recargaManualPendiente) {
      this.recargaManualPendiente = false;
      queueMicrotask(() => this.cargar());
    }
  }

  private cargarDetalle(idOrigen: string, automatica = false): void {
    if (this.cargando() || this.actualizando()) return;
    if (automatica) this.actualizando.set(true); else this.cargando.set(true);
    this.servicio.obtener(idOrigen).pipe(takeUntilDestroyed(this.destruirRef)).subscribe({
      next: ({ datos }) => { this.registros.set([datos]); this.cargando.set(false); this.actualizando.set(false); },
      error: (error: unknown) => { if (!automatica) this.error.set(obtenerMensajeError(error, 'historial')); this.cargando.set(false); this.actualizando.set(false); },
    });
  }

  private cargarAlmacenes(): void {
    this.almacenesServicio.obtenerAlmacenes()
      .pipe(takeUntilDestroyed(this.destruirRef))
      .subscribe({
        next: ({ datos }) => this.almacenes.set(datos),
        error: () => this.almacenes.set([]),
      });
  }

  private guardarFiltros(): void {
    try {
      this.filtrosGlobales.actualizar({ fechaDesde: this.filtros.fechaDesde,
        fechaHasta: this.filtros.fechaHasta, codigosAlmacen: this.filtros.codigosAlmacen });
      guardarFiltrosSesion(claveFiltrosHistorial, {
        fechaDesde: this.filtros.fechaDesde,
        fechaHasta: this.filtros.fechaHasta,
        numeroPedido: this.filtros.numeroPedido.trim(),
        codigosAlmacen: this.filtros.codigosAlmacen,
        vista: this.vista(),
        pagina: this.pagina(),
        paginaEspeciales: this.paginaEspeciales(),
        cantidadPorPagina: this.filtros.cantidadPorPagina,
      });
    } catch { /* Los filtros continúan disponibles durante la navegación actual. */ }
  }

  private leerFiltrosGuardados(): FiltrosHistorialGuardados {
    try {
      const valor = leerFiltrosSesion(claveFiltrosHistorial);
      const fechaValida = (fecha: unknown): fecha is string =>
        typeof fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fecha);
      const codigos = Array.isArray(valor['codigosAlmacen'])
        ? [...new Set(valor['codigosAlmacen'].filter((codigo): codigo is string =>
          typeof codigo === 'string' && /^[A-Za-z0-9_-]{1,16}$/.test(codigo)))] : [];
      return {
        fechaDesde: fechaValida(valor['fechaDesde']) ? valor['fechaDesde'] : undefined,
        fechaHasta: fechaValida(valor['fechaHasta']) ? valor['fechaHasta'] : undefined,
        numeroPedido: typeof valor['numeroPedido'] === 'string' && /^\d{0,20}$/.test(valor['numeroPedido'])
          ? valor['numeroPedido'] : undefined,
        codigosAlmacen: codigos,
        vista: valor['vista'] === 'articulos' || valor['vista'] === 'pedido'
          ? valor['vista'] : undefined,
        pagina: typeof valor['pagina'] === 'number' && valor['pagina'] > 0 ? valor['pagina'] : undefined,
        paginaEspeciales: typeof valor['paginaEspeciales'] === 'number'
          && valor['paginaEspeciales'] > 0 ? valor['paginaEspeciales'] : undefined,
        cantidadPorPagina: typeof valor['cantidadPorPagina'] === 'number'
          && [25, 50, 100].includes(valor['cantidadPorPagina']) ? valor['cantidadPorPagina'] : undefined,
      };
    } catch {
      return {};
    }
  }
}
