import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { Observable } from 'rxjs';
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
import { DialogoInventarioArticuloComponent, type EstadoConsultaInventario } from '../pedidos/dialogo-inventario-articulo.component';
import type { InventarioArticulo } from '../pedidos/pedido.interface';
import { PedidosService } from '../pedidos/pedidos.service';

const claveFiltrosHistorial = 'historial';
const intervaloActualizacionHistorialMs = 15000;

interface FiltrosHistorialGuardados {
  fechaDesde?: string;
  fechaHasta?: string;
  numeroPedido?: string;
  codigosAlmacen?: string[];
  vista?: VistaHistorial;
  pagina?: number;
  cantidadPorPagina?: number;
}
type VistaHistorial = 'pedido' | 'articulos';

@Component({
  selector: 'app-historial',
  imports: [FormsModule, RouterLink, DetallePedidoVistaComponent,
    DialogoInventarioArticuloComponent],
  templateUrl: './historial.component.html',
  styleUrls: ['../pedidos/lista-pedidos.component.css', './historial.component.css'],
})
export class HistorialComponent implements OnInit {
  private readonly servicio = inject(HistorialService);
  private readonly almacenesServicio = inject(AlmacenesService);
  private readonly pedidosServicio = inject(PedidosService);
  private readonly destruirRef = inject(DestroyRef);
  private readonly ruta = inject(ActivatedRoute);
  private readonly enrutador = inject(Router);
  private readonly filtrosGlobales = inject(FiltrosGlobalesService);
  private temporizador?: ReturnType<typeof setInterval>;
  private haCargado = false;
  private recargaManualPendiente = false;
  private consultaInventarioPendiente: string | null = null;
  public readonly idOrigen = signal<string | null>(null);
  public filtros = {
    fechaDesde: obtenerFechaLocalActual(),
    fechaHasta: obtenerFechaLocalActual(), numeroPedido: '', codigosAlmacen: [] as string[], cantidadPorPagina: 25,
  };
  public readonly almacenes = signal<Almacen[]>([]);
  public readonly registros = signal<HistorialValidado[]>([]);
  public readonly articulos = signal<ArticuloHistorial[]>([]);
  public readonly dialogoInventarioAbierto = signal(false);
  public readonly estadoInventario = signal<EstadoConsultaInventario>('cargando');
  public readonly inventarioArticulo = signal<InventarioArticulo | null>(null);
  public readonly vista = signal<VistaHistorial>('pedido');
  public readonly pagina = signal(1);
  public readonly hayMas = signal(false);
  public readonly cargando = signal(false);
  public readonly actualizando = signal(false);
  public readonly avisoActualizacion = signal('');
  public readonly error = signal<MensajeError | null>(null);
  public readonly configuracionDetalle: ConfiguracionDetallePedido = {
    contexto: 'Historial',
    titulo: 'Detalle del pedido',
    descripcion: 'Revisá los artículos y los datos de entrega.',
    etiquetaEstado: 'Entregado',
    severidadEstado: 'exito',
    etiquetaRetorno: 'Regresar al historial',
    tituloInformacion: 'Datos de entrega',
    etiquetaArticulos: 'Artículos entregados',
    soloConsulta: true,
  };
  public readonly detalleVisual = computed<PedidoDetalleVisual | null>(() => {
    if (!this.idOrigen()) return null;
    const pedido = this.registros()[0];
    if (!pedido) return null;
    return {
      numeroPedido: pedido.numeroPedido,
      vendedor: pedido.nombreVendedor,
      fechaPedido: pedido.fechaHoraPedido,
      bodega: pedido.nombresBodega,
      datosOperativos: [
        { etiqueta: 'Fecha de despacho', valor: pedido.despachadoEn, icono: 'pi pi-calendar-clock', esFecha: true },
        { etiqueta: 'Fecha de entrega', valor: pedido.validadoDetectadoEn, icono: 'pi pi-check-circle', esFecha: true },
        { etiqueta: 'Despachado por', valor: pedido.usuarioDespacho, icono: 'pi pi-user' },
        { etiqueta: 'Bodega', valor: pedido.codigosAlmacen.join(', ') || null, icono: 'pi pi-map-marker' },
      ].filter(({ valor }) => valor !== null && valor !== undefined && String(valor).trim() !== ''),
      articulos: pedido.articulos.map((articulo, indice) => ({
        clave: articulo.identificadorDetalle ?? `${articulo.codigoArticulo ?? 'articulo'}-${indice}`,
        codigo: articulo.codigoArticulo,
        descripcion: articulo.descripcion,
        cantidad: articulo.cantidad,
        codigoAlmacen: articulo.codigoAlmacen,
        nombreAlmacen: articulo.nombreAlmacen,
      })),
    };
  });

  public ngOnInit(): void {
    const idOrigen = this.ruta.snapshot.paramMap.get('idOrigen');
    this.idOrigen.set(idOrigen);
    if (idOrigen) {
      this.cargarDetalle(idOrigen);
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
    this.guardarFiltros();
    this.actualizarUrl();
    this.cargar();
  }
  public cambiarCantidadPorPagina(): void {
    this.pagina.set(1);
    this.guardarFiltros();
    this.actualizarUrl();
    this.cargar();
  }
  public cambiarVista(vista: VistaHistorial): void {
    if (this.vista() === vista) return;
    this.vista.set(vista); this.pagina.set(1); this.haCargado = false; this.hayMas.set(false);
    this.avisoActualizacion.set('');
    if (vista === 'articulos') this.articulos.set([]); else this.registros.set([]);
    this.guardarFiltros(); this.actualizarUrl(); this.cargar();
  }
  public limpiarFiltros(): void {
    this.filtros = { fechaDesde: obtenerFechaLocalActual(), fechaHasta: obtenerFechaLocalActual(),
      numeroPedido: '', codigosAlmacen: [], cantidadPorPagina: 25 };
    this.pagina.set(1); this.guardarFiltros(); this.actualizarUrl(); this.cargar();
  }
  public abrirInformacionArticulo(articulo: ArticuloHistorial): void {
    const codigoArticulo = articulo.codigoArticulo?.trim();
    const codigoAlmacen = articulo.codigoAlmacen?.trim();
    if (!codigoArticulo || !codigoAlmacen) return;
    const clave = `${codigoArticulo}\u0000${codigoAlmacen}`;
    if (this.consultaInventarioPendiente === clave) return;
    this.dialogoInventarioAbierto.set(true);
    this.estadoInventario.set('cargando');
    this.inventarioArticulo.set(null);
    this.consultaInventarioPendiente = clave;
    this.pedidosServicio.obtenerInventarioArticulo(codigoArticulo, codigoAlmacen)
      .pipe(takeUntilDestroyed(this.destruirRef)).subscribe({
        next: (inventario) => {
          this.inventarioArticulo.set(inventario);
          this.estadoInventario.set('datos');
          this.consultaInventarioPendiente = null;
        },
        error: (error: { status?: number }) => {
          this.estadoInventario.set(error.status === 404 ? 'no-encontrado' : 'error');
          this.consultaInventarioPendiente = null;
        },
      });
  }
  public cerrarInformacionArticulo(): void {
    this.dialogoInventarioAbierto.set(false);
  }
  public estaSeleccionado(codigoAlmacen: string): boolean {
    return this.filtros.codigosAlmacen.includes(codigoAlmacen);
  }
  public alternarAlmacen(codigoAlmacen: string, seleccionado: boolean): void {
    this.filtros.codigosAlmacen = seleccionado
      ? [...new Set([...this.filtros.codigosAlmacen, codigoAlmacen])]
      : this.filtros.codigosAlmacen.filter((codigo) => codigo !== codigoAlmacen);
    this.buscar();
  }
  public quitarAlmacen(codigoAlmacen: string): void {
    this.alternarAlmacen(codigoAlmacen, false);
  }
  public limpiarAlmacenes(): void {
    this.filtros.codigosAlmacen = [];
    this.buscar();
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
  public paginaAnterior(): void {
    if (this.pagina() > 1 && !this.cargando()) { this.pagina.update((valor) => valor - 1); this.guardarFiltros(); this.actualizarUrl(); this.cargar(); }
  }
  public paginaSiguiente(): void {
    if (this.hayMas() && !this.cargando()) { this.pagina.update((valor) => valor + 1); this.guardarFiltros(); this.actualizarUrl(); this.cargar(); }
  }
  public marcador(valor: string | null): string { return valor?.trim() || '—'; }
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
    const vista = parametros.get('vista') ?? guardados.vista;
    this.vista.set(vista === 'articulos' ? 'articulos' : 'pedido');
    this.guardarFiltros();
    this.actualizarUrl();
  }

  private parametrosActuales(): URLSearchParams {
    const parametros = new URLSearchParams({ fechaDesde: this.filtros.fechaDesde,
      fechaHasta: this.filtros.fechaHasta, pagina: String(this.pagina()),
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
    const consulta: Observable<RespuestaHistorial | RespuestaArticulosHistorial> = vistaConsulta === 'articulos' ? this.servicio.buscarArticulos({ ...this.filtros, pagina: this.pagina() })
      : this.servicio.buscar({ ...this.filtros, pagina: this.pagina() });
    consulta
      .pipe(takeUntilDestroyed(this.destruirRef)).subscribe({
        next: ({ datos, paginacion }) => {
          if (vistaConsulta === 'articulos') this.articulos.set(datos as ArticuloHistorial[]);
          else this.registros.set(datos as HistorialValidado[]);
          if (this.vista() === vistaConsulta) {
            this.hayMas.set(paginacion.hayMas); this.haCargado = true; this.avisoActualizacion.set('');
          } else {
            this.hayMas.set(false); this.haCargado = false;
          }
          this.finalizarConsulta(vistaConsulta);
        },
        error: (error: unknown) => {
          if (!this.haCargado && this.vista() === vistaConsulta) {
            this.registros.set([]); this.articulos.set([]); this.hayMas.set(false);
            this.error.set(obtenerMensajeError(error, 'historial'));
          } else if (this.vista() === vistaConsulta) {
            this.avisoActualizacion.set('No pudimos actualizar. Mostramos los datos anteriores.');
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

  private cargarDetalle(idOrigen: string): void {
    this.cargando.set(true);
    this.servicio.obtener(idOrigen).pipe(takeUntilDestroyed(this.destruirRef)).subscribe({
      next: ({ datos }) => { this.registros.set([datos]); this.cargando.set(false); },
      error: (error: unknown) => { this.error.set(obtenerMensajeError(error, 'historial')); this.cargando.set(false); },
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
        vista: valor['vista'] === 'articulos' ? 'articulos' : 'pedido',
        pagina: typeof valor['pagina'] === 'number' && valor['pagina'] > 0 ? valor['pagina'] : undefined,
        cantidadPorPagina: typeof valor['cantidadPorPagina'] === 'number'
          && [25, 50, 100].includes(valor['cantidadPorPagina']) ? valor['cantidadPorPagina'] : undefined,
      };
    } catch {
      return {};
    }
  }
}
