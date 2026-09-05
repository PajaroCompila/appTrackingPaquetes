import { HttpClient, HttpParams } from '@angular/common/http';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { EMPTY, Subject, catchError, exhaustMap, filter, finalize, map, merge, tap, timer } from 'rxjs';
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

const claveFiltrosDespachados = 'pedidosDespachados';
const intervaloActualizacionDespachadosMs = 15000;
const filtrosIniciales = (): FiltrosDespachados => ({
  numeroPedido: '', fechaDesde: obtenerFechaLocalActual(), fechaHasta: obtenerFechaLocalActual(),
  codigosAlmacen: [], cantidadPorPagina: 25,
});

@Component({
  selector: 'app-pedidos-despachados',
  imports: [FormsModule, RouterLink, DetallePedidoVistaComponent],
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
  private readonly actualizarAhora = new Subject<boolean>();
  private haCargado = false;
  private consultaEnCurso = false;
  private actualizacionManualPendiente = false;
  public filtros = filtrosIniciales();
  public readonly pagina = signal(1);
  public readonly hayMas = signal(false);
  public readonly totalRegistros = signal(0);
  public readonly almacenes = signal<Almacen[]>([]);
  public readonly pedidos = signal<Despachado[]>([]);
  public readonly idOrigen = signal<string | null>(null);
  public readonly cargando = signal(true);
  public readonly actualizando = signal(false);
  public readonly avisoActualizacion = signal('');
  public readonly ultimaActualizacion = signal<Date | null>(null);
  public readonly error = signal(false);
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
      soloConsulta: true,
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
      numeroPedido: pedido.numeroPedido,
      vendedor: pedido.nombreVendedor,
      fechaPedido: pedido.fechaHoraPedido,
      bodega: pedido.nombresBodega,
      datosOperativos: [
        { etiqueta: 'Fecha de despacho', valor: pedido.despachadoEn, icono: 'pi pi-calendar-clock', esFecha: true },
        { etiqueta: 'Usuario que despachó', valor: pedido.usuarioDespacho, icono: 'pi pi-user' },
        { etiqueta: 'Bodegas', valor: pedido.codigosAlmacen?.join(', ') || null, icono: 'pi pi-map-marker' },
        { etiqueta: 'Tipo de despacho', valor: pedido.esParcial === true ? 'Parcial' : 'Completo', icono: 'pi pi-check-circle' },
      ],
      articulos: pedido.articulos.map((articulo, indice) => ({
        clave: articulo.identificadorDetalle ?? `${articulo.codigoArticulo ?? 'articulo'}-${indice}`,
        codigo: articulo.codigoArticulo,
        descripcion: articulo.descripcion,
        cantidad: articulo.cantidad,
        codigoAlmacen: articulo.codigoAlmacen,
        nombreAlmacen: articulo.nombreAlmacen,
        fechaDespacho: articulo.transferidoEn ?? pedido.despachadoEn,
        usuario: articulo.usuarioTransferencia ?? pedido.usuarioDespacho,
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
    this.iniciarActualizacionAutomatica();
    this.actualizarAhora.next(false);
  }

  private consultarListado() {
    let parametros = new HttpParams()
      .set('pagina', this.pagina())
      .set('cantidadPorPagina', this.filtros.cantidadPorPagina)
      .set('fechaDesde', this.filtros.fechaDesde)
      .set('fechaHasta', this.filtros.fechaHasta);
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
        const firmaConsulta = this.firmaConsultaActual();
        if (!this.haCargado || !esAutomatica) this.cargando.set(true);
        else this.actualizando.set(true);
        if (!esAutomatica) this.error.set(false);
        return this.consultarListado().pipe(
          map((respuesta) => ({ respuesta, esAutomatica, firmaConsulta })),
          catchError(() => {
            if (this.firmaConsultaActual() !== firmaConsulta) {
              this.actualizacionManualPendiente = true;
              return EMPTY;
            }
            if (!this.haCargado || !esAutomatica) {
              this.marcarError();
            } else {
              this.avisoActualizacion.set('No pudimos actualizar. Mostramos los datos anteriores.');
            }
            return EMPTY;
          }),
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
    ).subscribe(({ respuesta, firmaConsulta }) => {
      if (this.firmaConsultaActual() !== firmaConsulta) {
        this.actualizacionManualPendiente = true;
        return;
      }
      const paginacion = respuesta.paginacion;
      this.hayMas.set(Boolean(paginacion?.hayMas));
      this.totalRegistros.set(paginacion?.totalRegistros ?? respuesta.datos.length);
      this.error.set(false);
      this.avisoActualizacion.set('');
      this.ultimaActualizacion.set(new Date());
      this.haCargado = true;
      this.finalizarCarga(respuesta.datos);
    });
  }

  public buscar(): void { this.guardarFiltros(); this.actualizarListado(1); }
  public limpiarFiltros(): void { this.filtros = filtrosIniciales(); this.actualizarListado(1); }
  public cambiarCantidadPorPagina(): void { this.actualizarListado(1); }
  public estaSeleccionado(codigo: string): boolean { return this.filtros.codigosAlmacen.includes(codigo); }
  public alternarAlmacen(codigo: string, seleccionado: boolean): void {
    const codigosAlmacen = seleccionado
      ? [...new Set([...this.filtros.codigosAlmacen, codigo])]
      : this.filtros.codigosAlmacen.filter((actual) => actual !== codigo);
    if (codigosAlmacen.join('\u0000') === this.filtros.codigosAlmacen.join('\u0000')) return;
    this.filtros.codigosAlmacen = codigosAlmacen;
    this.actualizarListado(1);
  }
  public quitarAlmacen(codigo: string): void { this.alternarAlmacen(codigo, false); }
  public limpiarAlmacenes(): void {
    if (this.filtros.codigosAlmacen.length === 0) return;
    this.filtros.codigosAlmacen = [];
    this.actualizarListado(1);
  }
  public nombreAlmacen(codigo: string): string {
    return this.almacenes().find((almacen) => almacen.codigoAlmacen === codigo)?.nombreAlmacen || codigo;
  }
  public resumenAlmacenes(): string {
    const cantidad = this.filtros.codigosAlmacen.length;
    return cantidad === 0 ? 'Todos los almacenes'
      : cantidad === 1 ? this.filtros.codigosAlmacen[0]! : `${cantidad} almacenes seleccionados`;
  }
  public paginaAnterior(): void { if (this.pagina() > 1 && !this.cargando()) this.actualizarListado(this.pagina() - 1); }
  public paginaSiguiente(): void { if (this.hayMas() && !this.cargando()) this.actualizarListado(this.pagina() + 1); }

  private actualizarListado(pagina: number): void {
    this.pagina.set(pagina); this.guardarFiltros(); this.actualizarUrl();
    this.cargando.set(true); this.error.set(false); this.actualizarAhora.next(false);
  }

  private actualizarUrl(): void {
    const queryParams: Record<string, string | number | string[]> = {
      pagina: this.pagina(), cantidadPorPagina: this.filtros.cantidadPorPagina,
      fechaDesde: this.filtros.fechaDesde, fechaHasta: this.filtros.fechaHasta,
    };
    if (this.filtros.numeroPedido.trim()) queryParams['numeroPedido'] = this.filtros.numeroPedido.trim();
    if (this.filtros.codigosAlmacen.length) queryParams['codigoAlmacen'] = this.filtros.codigosAlmacen;
    void this.enrutador.navigate([], { relativeTo: this.ruta, queryParams, replaceUrl: true });
  }

  private hidratarFiltros(): void {
    const parametros = this.ruta.snapshot.queryParamMap;
    const guardados = leerFiltrosSesion(claveFiltrosDespachados);
    const globales = this.filtrosGlobales.obtener();
    const codigosUrl = parametros.getAll('codigoAlmacen').map((codigo) => codigo.trim()).filter(Boolean);
    const cantidad = Number(parametros.get('cantidadPorPagina') ?? guardados['cantidadPorPagina']);
    this.filtros = {
      numeroPedido: parametros.get('numeroPedido') ?? (typeof guardados['numeroPedido'] === 'string' ? guardados['numeroPedido'] : ''),
      fechaDesde: esFechaCalendarioValida(parametros.get('fechaDesde')) ? parametros.get('fechaDesde')! : globales.fechaDesde,
      fechaHasta: esFechaCalendarioValida(parametros.get('fechaHasta')) ? parametros.get('fechaHasta')! : globales.fechaHasta,
      codigosAlmacen: [...new Set(codigosUrl.length ? codigosUrl : globales.codigosAlmacen)],
      cantidadPorPagina: cantidad === 50 || cantidad === 100 ? cantidad : 25,
    };
    this.pagina.set(Math.max(1, Number(parametros.get('pagina') ?? guardados['pagina']) || 1));
    this.guardarFiltros(); this.actualizarUrl();
  }

  private guardarFiltros(): void {
    this.filtrosGlobales.actualizar({ fechaDesde: this.filtros.fechaDesde,
      fechaHasta: this.filtros.fechaHasta, codigosAlmacen: this.filtros.codigosAlmacen });
    guardarFiltrosSesion(claveFiltrosDespachados, { ...this.filtros, pagina: this.pagina() });
  }

  private firmaConsultaActual(): string {
    return JSON.stringify({
      numeroPedido: this.filtros.numeroPedido.trim(),
      fechaDesde: this.filtros.fechaDesde,
      fechaHasta: this.filtros.fechaHasta,
      codigosAlmacen: this.filtros.codigosAlmacen,
      cantidadPorPagina: this.filtros.cantidadPorPagina,
      pagina: this.pagina(),
    });
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
