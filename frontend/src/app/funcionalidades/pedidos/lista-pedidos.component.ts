import { CommonModule } from '@angular/common';
import { Component, DestroyRef, HostListener, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink, type ParamMap } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EMPTY, Subject, catchError, exhaustMap, filter, finalize, map, merge, tap, timer } from 'rxjs';
import type { MensajeError } from '../../compartido/error-api.interface';
import { obtenerMensajeError } from '../../compartido/manejar-error-http';
import type { Almacen } from './almacen.interface';
import { AlmacenesService } from './almacenes.service';
import type { ArticuloPedidoResumen, FiltrosPedidos, PedidoResumen } from './pedido.interface';
import { PedidosService } from './pedidos.service';
import { esFechaCalendarioValida, guardarFiltrosSesion, leerFiltrosSesion, obtenerFechaLocalActual } from '../../compartido/estado-filtros-sesion';
import { formatearFechaHoraHonduras } from '../../compartido/fechas/fecha-honduras';
import { FiltrosGlobalesService } from '../../compartido/filtros-globales.service';
import { CodigoArticuloInventarioDirective } from '../../compartido/inventario/codigo-articulo-inventario.directive';
import {
  claveArticuloAsignado,
  type AsignacionArticulo,
  type IdentidadArticuloAsignacion,
  type TecnicoAsignable,
} from '../../compartido/asignaciones/asignacion.interface';
import { AsignacionesService } from '../../compartido/asignaciones/asignaciones.service';
import { AutenticacionService } from '../autenticacion/autenticacion.service';
import { PedidosNotificacionesService } from '../../compartido/notificaciones/pedidos-notificaciones.service';

interface FormularioFiltros {
  numeroPedido: string;
  fechaDesde: string;
  fechaHasta: string;
  codigosAlmacen: string[];
  codigoSincronizacion: string;
  cantidadPorPagina: 25 | 50 | 100;
}

const formularioInicial = (fechaActual = ''): FormularioFiltros => ({
  numeroPedido: '',
  fechaDesde: fechaActual,
  fechaHasta: fechaActual,
  codigosAlmacen: [],
  codigoSincronizacion: '',
  cantidadPorPagina: 25,
});
const claveFiltrosPedidos = 'pedidos';
const intervaloActualizacionPedidosMs = 15000;

@Component({
  selector: 'app-lista-pedidos',
  imports: [CommonModule, FormsModule, RouterLink, CodigoArticuloInventarioDirective],
  templateUrl: './lista-pedidos.component.html',
  styleUrl: './lista-pedidos.component.css',
})
export class ListaPedidosComponent implements OnInit {
  private readonly pedidosService = inject(PedidosService);
  private readonly almacenesService = inject(AlmacenesService);
  private readonly ruta = inject(ActivatedRoute);
  private readonly enrutador = inject(Router);
  private readonly destruirRef = inject(DestroyRef);
  private readonly filtrosGlobales = inject(FiltrosGlobalesService);
  private readonly asignacionesService = inject(AsignacionesService);
  private readonly autenticacion = inject(AutenticacionService);
  private readonly notificaciones = inject(PedidosNotificacionesService);
  private readonly actualizarAhora = new Subject<boolean>();
  private primeraConsulta = true;
  private consultaEnCurso = false;
  private actualizacionManualPendiente = false;
  private filtrosAplicados: FiltrosPedidos = { pagina: 1, cantidadPorPagina: 25 };
  private versionAsignaciones = 0;
  private usuariosAsignablesCargados = false;

  public filtrosFormulario = formularioInicial();
  public readonly pedidos = signal<PedidoResumen[]>([]);
  public readonly almacenes = signal<Almacen[]>([]);
  public readonly pagina = signal(1);
  public readonly hayMas = signal(false);
  public readonly totalRegistros = signal(0);
  public readonly cargando = signal(true);
  public readonly actualizando = signal(false);
  public readonly ultimaActualizacion = signal<Date | null>(null);
  public readonly error = signal<MensajeError | null>(null);
  public readonly errorAlmacenes = signal(false);
  public readonly transfiriendo = signal(false);
  public readonly mensajeTransferencia = signal('');
  public readonly lineasSeleccionadasTransferencia = signal<ReadonlySet<string>>(new Set());
  public readonly usuariosAsignables = signal<readonly TecnicoAsignable[]>([]);
  public readonly asignaciones = signal<ReadonlyMap<string, AsignacionArticulo>>(new Map());
  public readonly asignacionesGuardando = signal<ReadonlySet<string>>(new Set());
  public readonly puedeAsignar = signal(false);
  public readonly puedeAsignarTodos = signal(false);
  public readonly mensajeAsignacion = signal('');

  public ngOnInit(): void {
    this.cargarAlmacenes();
    this.cargarUsuariosAsignables();
    this.iniciarActualizacionAutomatica();
    this.ruta.queryParamMap
      .pipe(takeUntilDestroyed(this.destruirRef))
      .subscribe((parametros) => {
        this.limpiarSeleccionTransferencia();
        this.restaurarEstadoDesdeUrl(parametros);
        this.guardarFiltros();
        this.filtrosAplicados = this.copiarFiltros(this.construirFiltros());
        const parametrosNormalizados = this.construirParametros(this.pagina());
        if (!this.sonParametrosEquivalentes(parametros, parametrosNormalizados)) {
          void this.enrutador.navigate([], {
            relativeTo: this.ruta,
            queryParams: parametrosNormalizados,
            replaceUrl: true,
          });
        }
        this.actualizarAhora.next(false);
      });
  }

  public buscar(): void {
    this.limpiarSeleccionTransferencia();
    this.guardarFiltros();
    void this.actualizarRuta(1);
  }

  public limpiarFiltros(): void {
    this.limpiarSeleccionTransferencia();
    this.filtrosFormulario = formularioInicial(obtenerFechaLocalActual());
    this.guardarFiltros();
    void this.actualizarRuta(1);
  }

  public cambiarCantidadPorPagina(): void {
    void this.actualizarRuta(1);
  }

  public estaSeleccionado(codigoAlmacen: string): boolean {
    return this.filtrosFormulario.codigosAlmacen.includes(codigoAlmacen);
  }

  public alternarAlmacen(codigoAlmacen: string, seleccionado: boolean): void {
    const actuales = this.filtrosFormulario.codigosAlmacen;
    this.filtrosFormulario.codigosAlmacen = seleccionado
      ? [...new Set([...actuales, codigoAlmacen])]
      : actuales.filter((codigo) => codigo !== codigoAlmacen);
    this.guardarFiltros();
    void this.actualizarRuta(1);
  }

  public quitarAlmacen(codigoAlmacen: string): void {
    this.alternarAlmacen(codigoAlmacen, false);
  }

  public limpiarAlmacenes(): void {
    this.filtrosFormulario.codigosAlmacen = [];
    this.guardarFiltros();
    void this.actualizarRuta(1);
  }

  public resumenAlmacenes(): string {
    const seleccionados = this.filtrosFormulario.codigosAlmacen;
    if (seleccionados.length === 0) return 'Todos los almacenes';
    if (seleccionados.length === 1) {
      return seleccionados[0] ?? '';
    }
    return `${seleccionados.length} almacenes seleccionados`;
  }

  public nombreAlmacen(codigoAlmacen: string): string {
    const almacen = this.almacenes().find((item) => item.codigoAlmacen === codigoAlmacen);
    return almacen?.nombreAlmacen || codigoAlmacen;
  }

  public codigosBodega(codigosAlmacen: string[]): string {
    return codigosAlmacen.length > 0 ? codigosAlmacen.join(', ') : '—';
  }

  public paginaAnterior(): void {
    this.limpiarSeleccionTransferencia();
    if (this.pagina() > 1 && !this.cargando()) {
      void this.actualizarRuta(this.pagina() - 1);
    }
  }

  public paginaSiguiente(): void {
    this.limpiarSeleccionTransferencia();
    if (this.hayMas() && !this.cargando()) {
      void this.actualizarRuta(this.pagina() + 1);
    }
  }

  public reintentar(): void {
    this.actualizarAhora.next(false);
  }

  public puedeAsignarPedidos(): boolean {
    const usuario = this.autenticacion.usuario();
    return usuario?.codigoRol === 'ADMINISTRADOR'
      || usuario?.nombreUsuario.trim().toLowerCase() === 'gcruz';
  }

  public asignacionActual(
    pedido: PedidoResumen,
    articulo: ArticuloPedidoResumen,
  ): AsignacionArticulo | null {
    const identidad = this.identidadAsignacion(pedido, articulo);
    return identidad ? this.asignaciones().get(claveArticuloAsignado(identidad)) ?? null : null;
  }

  public nombreAsignado(pedido: PedidoResumen, articulo: ArticuloPedidoResumen): string {
    if (this.puedeAsignarPedidos()) {
      return this.asignacionActual(pedido, articulo)?.nombreAsignado ?? 'Sin asignar';
    }
    return this.autenticacion.usuario()?.nombreVisible ?? 'Sin asignar';
  }

  public valorAsignacionVisible(pedido: PedidoResumen, articulo: ArticuloPedidoResumen): string {
    const usuarioAsignado = this.asignacionActual(pedido, articulo)?.usuarioAsignado;
    return usuarioAsignado && this.usuariosAsignables().some(({ usuario }) => usuario === usuarioAsignado)
      ? usuarioAsignado
      : '';
  }

  public asignacionFueraDelCatalogo(
    pedido: PedidoResumen,
    articulo: ArticuloPedidoResumen,
  ): AsignacionArticulo | null {
    const asignacion = this.asignacionActual(pedido, articulo);
    return asignacion?.usuarioAsignado
      && !this.usuariosAsignables().some(({ usuario }) => usuario === asignacion.usuarioAsignado)
      ? asignacion
      : null;
  }

  public asignacionGuardando(pedido: PedidoResumen, articulo: ArticuloPedidoResumen): boolean {
    const identidad = this.identidadAsignacion(pedido, articulo);
    return Boolean(identidad && this.asignacionesGuardando().has(claveArticuloAsignado(identidad)));
  }

  public cambiarAsignacion(
    pedido: PedidoResumen,
    articulo: ArticuloPedidoResumen,
    usuarioAsignado: string,
  ): void {
    const identidad = this.identidadAsignacion(pedido, articulo);
    if (!identidad || !this.puedeAsignar() || this.asignacionGuardando(pedido, articulo)) return;
    const usuarioActual = this.autenticacion.usuario()?.nombreUsuario.trim().toLowerCase();
    if (!this.puedeAsignarTodos()
      && usuarioAsignado.trim().toLowerCase() !== usuarioActual) return;
    const tecnico = this.usuariosAsignables().find(({ usuario }) => usuario === usuarioAsignado);
    if (usuarioAsignado && !tecnico) return;
    const clave = claveArticuloAsignado(identidad);
    const anterior = this.asignaciones().get(clave);
    const nuevas = new Map(this.asignaciones());
    nuevas.set(clave, {
      ...identidad,
      usuarioAsignado: tecnico?.usuario ?? null,
      nombreAsignado: tecnico?.nombre ?? null,
      actualizadoEn: anterior?.actualizadoEn ?? null,
    });
    this.asignaciones.set(nuevas);
    this.asignacionesGuardando.update((actuales) => new Set([...actuales, clave]));
    this.mensajeAsignacion.set('');
    this.versionAsignaciones += 1;

    this.asignacionesService.guardar(identidad, tecnico?.usuario ?? null)
      .pipe(takeUntilDestroyed(this.destruirRef))
      .subscribe({
        next: ({ datos }) => {
          const guardadas = new Map(this.asignaciones());
          guardadas.set(clave, datos);
          this.asignaciones.set(guardadas);
          this.finalizarGuardadoAsignacion(clave);
        },
        error: () => {
          const restauradas = new Map(this.asignaciones());
          if (anterior) restauradas.set(clave, anterior); else restauradas.delete(clave);
          this.asignaciones.set(restauradas);
          this.finalizarGuardadoAsignacion(clave);
          this.mensajeAsignacion.set('No se pudo guardar la asignación. Intentá nuevamente.');
        },
      });
  }

  public claveLineaTransferencia(
    pedido: PedidoResumen,
    articulo: ArticuloPedidoResumen,
    indice: number,
  ): string {
    return this.claveEstableLinea(pedido, articulo, indice);
  }

  public estaSeleccionadoParaTransferencia(
    pedido: PedidoResumen,
    articulo: ArticuloPedidoResumen,
    indice: number,
  ): boolean {
    return this.lineasSeleccionadasTransferencia()
      .has(this.claveLineaTransferencia(pedido, articulo, indice));
  }

  public alternarSeleccionTransferencia(
    pedido: PedidoResumen,
    articulo: ArticuloPedidoResumen,
    indice: number,
    seleccionado: boolean,
  ): void {
    const nuevas = new Set(this.lineasSeleccionadasTransferencia());
    const clave = this.claveLineaTransferencia(pedido, articulo, indice);
    if (seleccionado) nuevas.add(clave); else nuevas.delete(clave);
    this.lineasSeleccionadasTransferencia.set(nuevas);
    this.mensajeTransferencia.set('');
  }

  private limpiarSeleccionTransferencia(): void {
    this.lineasSeleccionadasTransferencia.set(new Set());
  }

  private reconciliarSeleccionTransferencia(pedidos: PedidoResumen[]): void {
    const visibles = new Set<string>();
    for (const pedido of pedidos) {
      pedido.articulos.forEach((articulo, indice) => {
        visibles.add(this.claveLineaTransferencia(pedido, articulo, indice));
      });
    }
    this.lineasSeleccionadasTransferencia.set(new Set(
      [...this.lineasSeleccionadasTransferencia()].filter((clave) => visibles.has(clave)),
    ));
  }

  public transferir(): void {
    if (this.lineasSeleccionadasTransferencia().size === 0 || this.transfiriendo()) return;
    const lineas = this.obtenerIdentidadesSeleccionadasTransferencia();
    if (lineas.length === 0) return;
    this.transfiriendo.set(true);
    this.mensajeTransferencia.set('');
    this.pedidosService.despacharLineas(lineas)
      .pipe(takeUntilDestroyed(this.destruirRef))
      .subscribe({
        next: ({ datos }) => {
          const transferidas = new Set(datos.transferidas.map(({ idOrigen, identificadorDetalle }) =>
            `${idOrigen}\u0000${identificadorDetalle}`));
          let pedidosRetirados = 0;
          this.pedidos.update((pedidos) => pedidos.map((pedido) => ({ ...pedido,
            articulos: pedido.articulos.filter((articulo) => {
              const identidad = articulo.identificadorDetalle?.trim();
              return !identidad || !transferidas.has(`${pedido.idOrigen}\u0000${identidad}`);
            }),
          })).filter((pedido) => {
            if (pedido.articulos.length > 0) return true;
            pedidosRetirados += 1;
            return false;
          }));
          if (pedidosRetirados > 0) {
            this.totalRegistros.update((total) => Math.max(0, total - pedidosRetirados));
          }
          this.limpiarSeleccionTransferencia();
          this.mensajeTransferencia.set(
            `${datos.transferidas.length} artículo(s) transferido(s) a despachados.`,
          );
          this.transfiriendo.set(false);
          this.actualizarAhora.next(false);
        },
        error: (error: { error?: { mensaje?: string } }) => {
          this.mensajeTransferencia.set(
            error.error?.mensaje || 'No pudimos transferir los artículos. Probá de nuevo.',
          );
          this.transfiriendo.set(false);
        },
      });
  }

  @HostListener('window:keydown', ['$event'])
  public atajoF8(evento: KeyboardEvent): void {
    const objetivo = evento.target as HTMLElement | null;
    if (evento.key !== 'F8' || evento.repeat || this.transfiriendo()
      || this.lineasSeleccionadasTransferencia().size === 0
      || objetivo?.matches('input,textarea,select,[contenteditable="true"],[role="dialog"]')) return;
    evento.preventDefault();
    if (window.confirm(`¿Transferir ${this.lineasSeleccionadasTransferencia().size} artículo(s)?`)) {
      this.transferir();
    }
  }

  public marcador(valor: string | number | null): string | number {
    return valor === null || valor === '' ? '—' : valor;
  }

  public claveArticulo(
    articulo: ArticuloPedidoResumen,
    indice: number,
  ): string {
    void indice;
    const identificador = articulo.identificadorDetalle
      ?? [articulo.codigoArticulo ?? '', articulo.codigoAlmacen ?? '',
        articulo.descripcion ?? '', String(articulo.cantidad ?? '')].join('|');
    return identificador;
  }

  public formatearFechaHora(valor: string | null): string {
    return formatearFechaHoraHonduras(valor);
  }

  public rutaRetorno(): string {
    const urlActual = this.enrutador.url;
    return urlActual === '/pedidos' || urlActual.startsWith('/pedidos?')
      ? urlActual
      : this.enrutador.createUrlTree(['/pedidos'], {
        queryParams: this.construirParametros(this.pagina()),
      }).toString();
  }

  private cargarAlmacenes(): void {
    this.almacenesService.obtenerAlmacenes()
      .pipe(takeUntilDestroyed(this.destruirRef))
      .subscribe({
        next: ({ datos }) => {
          this.almacenes.set(datos);
          this.errorAlmacenes.set(false);
        },
        error: () => this.errorAlmacenes.set(true),
      });
  }

  private iniciarActualizacionAutomatica(): void {
    merge(
      this.actualizarAhora,
      timer(intervaloActualizacionPedidosMs, intervaloActualizacionPedidosMs).pipe(map(() => true)),
    ).pipe(
      tap((esAutomatica) => {
        if (this.consultaEnCurso && !esAutomatica) this.actualizacionManualPendiente = true;
      }),
      filter(() => !this.consultaEnCurso),
      exhaustMap((esAutomatica) => {
        this.consultaEnCurso = true;
        const filtrosConsulta = this.copiarFiltros(this.filtrosAplicados);
        const mostrarCargaInicial = this.primeraConsulta;
        if (mostrarCargaInicial) this.cargando.set(true);
        else this.actualizando.set(true);
        if (!esAutomatica) this.error.set(null);
        return this.pedidosService.obtenerPedidos(filtrosConsulta).pipe(
          map((respuesta) => ({ respuesta, esAutomatica, filtrosConsulta })),
          catchError((error: unknown) => {
            if (this.primeraConsulta) {
              this.pedidos.set([]);
              this.hayMas.set(false);
              this.totalRegistros.set(0);
              this.error.set(obtenerMensajeError(error, 'listado'));
            }
            this.cargando.set(false);
            this.actualizando.set(false);
            this.primeraConsulta = false;
            return EMPTY;
          }),
          finalize(() => {
            this.consultaEnCurso = false;
            if (this.actualizacionManualPendiente) {
              this.actualizacionManualPendiente = false;
              queueMicrotask(() => this.actualizarAhora.next(false));
            }
          }),
        );
      }),
      takeUntilDestroyed(this.destruirRef),
    ).subscribe(({ respuesta: { datos, paginacion }, esAutomatica, filtrosConsulta }) => {
      if (!esAutomatica && datos.length === 0 && this.pagina() > 1) {
        void this.actualizarRuta(this.pagina() - 1);
        return;
      }
      this.reconciliarSeleccionTransferencia(datos);
      this.notificaciones.procesarRespuesta(datos, filtrosConsulta, !esAutomatica);
      this.pedidos.set(datos);
      this.cargarAsignaciones(datos);
      this.pagina.set(paginacion.pagina);
      this.hayMas.set(paginacion.hayMas);
      this.totalRegistros.set(paginacion.totalRegistros ?? datos.length);
      this.ultimaActualizacion.set(new Date());
      this.cargando.set(false);
      this.actualizando.set(false);
      this.primeraConsulta = false;
    });
  }

  private construirFiltros(): FiltrosPedidos {
    const filtros: FiltrosPedidos = {
      pagina: this.pagina(),
      cantidadPorPagina: this.filtrosFormulario.cantidadPorPagina,
    };
    const opcionales = {
      numeroPedido: this.filtrosFormulario.numeroPedido.trim(),
      fechaDesde: this.filtrosFormulario.fechaDesde,
      fechaHasta: this.filtrosFormulario.fechaHasta,
      codigoSincronizacion: this.filtrosFormulario.codigoSincronizacion.trim(),
    };
    for (const [nombre, valor] of Object.entries(opcionales)) {
      if (valor) Object.assign(filtros, { [nombre]: valor });
    }
    if (this.filtrosFormulario.codigosAlmacen.length > 0) {
      filtros.codigosAlmacen = [...this.filtrosFormulario.codigosAlmacen];
    }
    return filtros;
  }

  private copiarFiltros(filtros: FiltrosPedidos): FiltrosPedidos {
    return { ...filtros,
      codigosAlmacen: filtros.codigosAlmacen ? [...filtros.codigosAlmacen] : undefined };
  }

  private construirParametros(pagina: number): Record<string, string | number | string[]> {
    const filtros = this.construirFiltros();
    const parametros: Record<string, string | number | string[]> = {
      pagina,
      cantidadPorPagina: filtros.cantidadPorPagina,
    };
    for (const [nombre, valor] of Object.entries(filtros)) {
      if (nombre !== 'pagina' && nombre !== 'cantidadPorPagina' && valor) {
        parametros[nombre === 'codigosAlmacen' ? 'codigoAlmacen' : nombre] = valor;
      }
    }
    return parametros;
  }

  private restaurarEstadoDesdeUrl(parametros: ParamMap): void {
    const globales = this.filtrosGlobales.obtener();
    const guardados = this.leerFiltrosGuardados();
    const cantidadSolicitada = Number(parametros.get('cantidadPorPagina') ?? guardados.cantidadPorPagina);
    const paginaSolicitada = Number(parametros.get('pagina') ?? guardados.pagina);
    const codigosUrl = parametros.getAll('codigoAlmacen').map((codigo) => codigo.trim())
      .filter((codigo) => /^[A-Za-z0-9_-]{1,16}$/.test(codigo));
    const fechaDesdeUrl = parametros.get('fechaDesde');
    const fechaHastaUrl = parametros.get('fechaHasta');
    this.filtrosFormulario = {
      numeroPedido: parametros.get('numeroPedido') ?? parametros.get('folioPedido')
        ?? guardados.numeroPedido ?? '',
      fechaDesde: esFechaCalendarioValida(fechaDesdeUrl) ? fechaDesdeUrl : globales.fechaDesde,
      fechaHasta: esFechaCalendarioValida(fechaHastaUrl) ? fechaHastaUrl : globales.fechaHasta,
      codigosAlmacen: codigosUrl.length > 0 ? [...new Set(codigosUrl)] : globales.codigosAlmacen,
      codigoSincronizacion: parametros.get('codigoSincronizacion') ?? guardados.codigoSincronizacion ?? '',
      cantidadPorPagina: cantidadSolicitada === 50 || cantidadSolicitada === 100
        ? cantidadSolicitada
        : 25,
    };
    this.pagina.set(
      Number.isInteger(paginaSolicitada) && paginaSolicitada > 0 ? paginaSolicitada : 1,
    );
  }

  private guardarFiltros(): void {
    try {
      this.filtrosGlobales.actualizar({
        fechaDesde: this.filtrosFormulario.fechaDesde,
        fechaHasta: this.filtrosFormulario.fechaHasta,
        codigosAlmacen: this.filtrosFormulario.codigosAlmacen,
      });
      guardarFiltrosSesion(claveFiltrosPedidos, {
        ...this.filtrosFormulario, pagina: this.pagina(),
      });
    } catch { /* La pantalla conserva los filtros mientras permanece abierta. */ }
  }

  private leerFiltrosGuardados(): Partial<FormularioFiltros> & { pagina?: number } {
    try {
      const valor = leerFiltrosSesion(claveFiltrosPedidos);
      return valor && typeof valor === 'object' ? valor as Partial<FormularioFiltros> & { pagina?: number } : {};
    } catch { return {}; }
  }

  private sonParametrosEquivalentes(
    actuales: ParamMap,
    esperados: Record<string, string | number | string[]>,
  ): boolean {
    const clavesEsperadas = Object.keys(esperados).sort();
    if (actuales.keys.slice().sort().join('|') !== clavesEsperadas.join('|')) return false;
    return clavesEsperadas.every((clave) => {
      const valorEsperado = esperados[clave];
      const valoresEsperados = (Array.isArray(valorEsperado) ? valorEsperado : [valorEsperado])
        .map(String);
      const valoresActuales = actuales.getAll(clave);
      return valoresActuales.length === valoresEsperados.length
        && valoresActuales.every((valor, indice) => valor === valoresEsperados[indice]);
    });
  }

  private async actualizarRuta(pagina: number): Promise<void> {
    this.limpiarSeleccionTransferencia();
    const navego = await this.enrutador.navigate([], {
      relativeTo: this.ruta,
      queryParams: this.construirParametros(pagina),
    });
    if (!navego) {
      this.pagina.set(pagina);
      this.actualizarAhora.next(false);
    }
  }

  private claveEstableLinea(
    pedido: PedidoResumen,
    articulo: ArticuloPedidoResumen,
    indice: number,
  ): string {
    void indice;
    const detalle = articulo.identificadorDetalle?.trim();
    return `${pedido.idOrigen}\u0000${detalle ?? ''}`;
  }

  private obtenerIdentidadesSeleccionadasTransferencia(): {
    idOrigen: string;
    identificadorDetalle: string;
  }[] {
    const seleccionadas = this.lineasSeleccionadasTransferencia();
    const resultado: { idOrigen: string; identificadorDetalle: string }[] = [];
    for (const pedido of this.pedidos()) {
      pedido.articulos.forEach((articulo, indice) => {
        const identificadorDetalle = articulo.identificadorDetalle?.trim();
        if (identificadorDetalle
          && seleccionadas.has(this.claveLineaTransferencia(pedido, articulo, indice))) {
          resultado.push({ idOrigen: pedido.idOrigen, identificadorDetalle });
        }
      });
    }
    return resultado;
  }

  private cargarUsuariosAsignables(): void {
    this.asignacionesService.obtenerUsuarios()
      .pipe(takeUntilDestroyed(this.destruirRef))
      .subscribe({
        next: ({ datos, puedeAsignar, puedeAsignarTodos }) => {
          const usuarioActual = this.autenticacion.usuario()?.nombreUsuario.trim().toLowerCase();
          const asignaTodos = puedeAsignarTodos && this.puedeAsignarPedidos();
          const visibles = asignaTodos
            ? datos
            : datos.filter(({ usuario }) => usuario.trim().toLowerCase() === usuarioActual);
          this.usuariosAsignables.set(visibles);
          this.puedeAsignarTodos.set(asignaTodos);
          this.puedeAsignar.set(puedeAsignar && asignaTodos && visibles.length > 0);
          this.usuariosAsignablesCargados = true;
          this.cargarAsignaciones(this.pedidos());
        },
        error: () => {
          this.usuariosAsignables.set([]);
          this.puedeAsignar.set(false);
          this.puedeAsignarTodos.set(false);
          this.usuariosAsignablesCargados = false;
        },
      });
  }

  private cargarAsignaciones(pedidos: PedidoResumen[]): void {
    if (!this.usuariosAsignablesCargados) return;
    const lineas = pedidos.flatMap((pedido) => pedido.articulos.flatMap((articulo) => {
      const identidad = this.identidadAsignacion(pedido, articulo);
      return identidad ? [identidad] : [];
    }));
    if (lineas.length === 0) return;
    const versionConsulta = this.versionAsignaciones;
    const consulta = this.puedeAsignarTodos()
      ? this.asignacionesService.consultar(lineas)
      : this.asignacionesService.autoasignar(lineas);
    consulta
      .pipe(takeUntilDestroyed(this.destruirRef))
      .subscribe({
        next: ({ datos }) => {
          if (versionConsulta !== this.versionAsignaciones) return;
          const actuales = new Map(this.asignaciones());
          datos.forEach((asignacion) => actuales.set(claveArticuloAsignado(asignacion), asignacion));
          this.asignaciones.set(actuales);
        },
        error: () => undefined,
      });
  }

  private identidadAsignacion(
    pedido: PedidoResumen,
    articulo: ArticuloPedidoResumen,
  ): IdentidadArticuloAsignacion | null {
    const idOrigen = pedido.idOrigen.trim();
    const identificadorDetalle = articulo.identificadorDetalle?.trim();
    return idOrigen && identificadorDetalle ? { idOrigen, identificadorDetalle } : null;
  }

  private finalizarGuardadoAsignacion(clave: string): void {
    this.asignacionesGuardando.update((actuales) => {
      const nuevos = new Set(actuales);
      nuevos.delete(clave);
      return nuevos;
    });
  }

}
