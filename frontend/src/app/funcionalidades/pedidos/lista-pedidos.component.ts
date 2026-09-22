import { CommonModule } from '@angular/common';
import { Component, DestroyRef, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SelectorAlmacenesDirective } from '../../compartido/interaccion/selector-almacenes.directive';
import { ActivatedRoute, Router, RouterLink, type ParamMap } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EMPTY, Subject, catchError, exhaustMap, filter, finalize, forkJoin, map, merge, of, tap, timer } from 'rxjs';
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
import { PaginacionComponent } from '../../compartido/paginacion/paginacion.component';
import { FacturadosPendientesService } from '../facturados-pendientes/facturados-pendientes.service';
import { AccionSeleccionDetalleComponent } from '../../compartido/detalle-pedido/controles-seleccion-detalle.component';
import { VistaImpresionPedidoComponent, type ArticuloImpresionPedido } from './vista-impresion-pedido.component';
import { ConfirmacionImpresionComponent } from '../../compartido/impresiones/confirmacion-impresion.component';
import { ImpresionesService } from '../../compartido/impresiones/impresiones.service';
import type { LineaRegistroImpresion } from '../../compartido/impresiones/impresion.interface';
import { duracionPedidoMs, formatearDuracionPedido } from '../../compartido/tiempo-pedido';

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
const intervaloRelojSlaMs = 1000;
const limiteSlaAdvertenciaMs = 5 * 60 * 1000;
const limiteSlaCriticaMs = 10 * 60 * 1000;
type VistaPedidos = 'articulos' | 'pedido';
type EstadoTiempoSla = 'ok' | 'advertencia' | 'critica';

interface GrupoPedidos {
  clave: 'normales' | 'especiales';
  titulo: string;
  pedidos: PedidoResumen[];
  pagina: number;
  totalRegistros: number;
}

@Component({
  selector: 'app-lista-pedidos',
  imports: [CommonModule, FormsModule, RouterLink, CodigoArticuloInventarioDirective,
    PaginacionComponent, SelectorAlmacenesDirective, AccionSeleccionDetalleComponent,
    VistaImpresionPedidoComponent, ConfirmacionImpresionComponent],
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
  private readonly facturadosPendientesService = inject(FacturadosPendientesService);
  private readonly impresionesService = inject(ImpresionesService);
  private readonly actualizarAhora = new Subject<boolean>();
  private primeraConsulta = true;
  private consultaEnCurso = false;
  private actualizacionManualPendiente = false;
  private filtrosAplicados: FiltrosPedidos = { pagina: 1, cantidadPorPagina: 25 };
  private revisionFiltros = 0;
  private versionAsignaciones = 0;
  private usuariosAsignablesCargados = false;
  private desfaseRelojServidorMs = 0;
  private loteImpresion: LineaRegistroImpresion[] | null = null;
  private esperandoCierreImpresion = false;
  private temporizadorImpresion?: ReturnType<typeof setTimeout>;

  public filtrosFormulario = formularioInicial();
  public readonly pedidos = signal<PedidoResumen[]>([]);
  public readonly pedidosEspeciales = signal<PedidoResumen[]>([]);
  public readonly vista = signal<VistaPedidos>('articulos');
  public readonly almacenes = signal<Almacen[]>([]);
  public readonly pagina = signal(1);
  public readonly paginaEspeciales = signal(1);
  public readonly hayMas = signal(false);
  public readonly totalRegistros = signal(0);
  public readonly totalRegistrosEspeciales = signal(0);
  public readonly cantidadFacturadosPendientes = signal(0);
  public readonly cargando = signal(true);
  public readonly actualizando = signal(false);
  public readonly ultimaActualizacion = signal<Date | null>(null);
  public readonly error = signal<MensajeError | null>(null);
  public readonly errorAlmacenes = signal(false);
  public readonly transfiriendo = signal(false);
  public readonly mensajeTransferencia = signal('');
  public readonly lineasSeleccionadasTransferencia = signal<ReadonlySet<string>>(new Set());
  public readonly lineasSeleccionadasImpresion = signal<ReadonlySet<string>>(new Set());
  public readonly articulosImpresion = signal<readonly ArticuloImpresionPedido[]>([]);
  public readonly fechaHoraImpresion = signal('');
  public readonly preparandoImpresion = signal(false);
  public readonly confirmarImpresion = signal(false);
  public readonly guardandoImpresion = signal(false);
  public readonly mensajeImpresion = signal('');
  public readonly errorRegistroImpresion = signal('');
  public readonly usuariosAsignables = signal<readonly TecnicoAsignable[]>([]);
  public readonly asignaciones = signal<ReadonlyMap<string, AsignacionArticulo>>(new Map());
  public readonly seleccionesAsignacion = signal<ReadonlyMap<string, string>>(new Map());
  public readonly asignacionesGuardando = signal<ReadonlySet<string>>(new Set());
  public readonly puedeAsignar = signal(false);
  public readonly puedeAsignarTodos = signal(false);
  public readonly puedeReasignar = signal(false);
  public readonly asignacionesDesbloqueadas = signal<ReadonlySet<string>>(new Set());
  public readonly mensajeAsignacion = signal('');
  public readonly mensajeAsignacionEsError = signal(false);
  public readonly ahoraSlaMs = signal(Date.now());
  public readonly gruposPedidos = computed<GrupoPedidos[]>(() => [
    { clave: 'normales', titulo: 'Pedidos Normales', pedidos: this.pedidos(), pagina: this.pagina(), totalRegistros: this.totalRegistros() },
    { clave: 'especiales', titulo: 'Pedidos Especiales', pedidos: this.pedidosEspeciales(), pagina: this.paginaEspeciales(), totalRegistros: this.totalRegistrosEspeciales() },
  ]);

  public ngOnInit(): void {
    this.destruirRef.onDestroy(() => clearTimeout(this.temporizadorImpresion));
    this.cargarAlmacenes();
    this.cargarUsuariosAsignables();
    this.iniciarActualizacionFacturadosPendientes();
    this.iniciarActualizacionAutomatica();
    this.iniciarRelojSla();
    this.ruta.queryParamMap
      .pipe(takeUntilDestroyed(this.destruirRef))
      .subscribe((parametros) => {
        this.limpiarSeleccionesOperativas();
        this.restaurarEstadoDesdeUrl(parametros);
        this.guardarFiltros();
        this.filtrosAplicados = this.copiarFiltros(this.construirFiltros());
        ++this.revisionFiltros;
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
    this.limpiarSeleccionesOperativas();
    this.guardarFiltros();
    void this.actualizarRuta(1);
  }

  public limpiarFiltros(): void {
    this.limpiarSeleccionesOperativas();
    this.filtrosFormulario = formularioInicial(obtenerFechaLocalActual());
    this.guardarFiltros();
    void this.actualizarRuta(1);
  }

  public cambiarCantidadPorPagina(): void {
    void this.actualizarRuta(1);
  }

  public cambiarVista(vista: VistaPedidos): void {
    if (this.vista() === vista) return;
    this.vista.set(vista);
    this.limpiarSeleccionesOperativas();
    void this.actualizarRuta(1);
  }

  public estaSeleccionado(codigoAlmacen: string): boolean {
    return this.filtrosFormulario.codigosAlmacen.includes(codigoAlmacen);
  }

  public alternarAlmacen(codigoAlmacen: string, seleccionado: boolean): void {
    const actuales = this.filtrosFormulario.codigosAlmacen;
    if (actuales.includes(codigoAlmacen) === seleccionado) return;
    this.filtrosFormulario.codigosAlmacen = seleccionado
      ? [...new Set([...actuales, codigoAlmacen])]
      : actuales.filter((codigo) => codigo !== codigoAlmacen);
    this.aplicarSeleccionAlmacenes();
  }

  public quitarAlmacen(codigoAlmacen: string): void {
    this.alternarAlmacen(codigoAlmacen, false);
  }

  public limpiarAlmacenes(): void {
    if (this.filtrosFormulario.codigosAlmacen.length === 0) return;
    this.filtrosFormulario.codigosAlmacen = [];
    this.aplicarSeleccionAlmacenes();
  }

  private aplicarSeleccionAlmacenes(): void {
    this.pagina.set(1);
    this.paginaEspeciales.set(1);
    this.filtrosAplicados = this.copiarFiltros(this.construirFiltros());
    ++this.revisionFiltros;
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
    this.limpiarSeleccionesOperativas();
    if (this.pagina() > 1 && !this.cargando()) {
      void this.actualizarRuta(this.pagina() - 1);
    }
  }

  public paginaSiguiente(): void {
    this.limpiarSeleccionesOperativas();
    if (this.hayMas() && !this.cargando()) {
      void this.actualizarRuta(this.pagina() + 1);
    }
  }

  public irPagina(grupo: 'normales' | 'especiales', pagina: number): void {
    if (this.cargando()) return;
    if (grupo === 'normales') this.pagina.set(pagina);
    else this.paginaEspeciales.set(pagina);
    void this.actualizarRuta(this.pagina());
  }

  public reintentar(): void {
    this.actualizarAhora.next(false);
  }

  public puedeAsignarPedidos(): boolean {
    const usuario = this.autenticacion.usuario();
    return usuario?.codigoRol === 'ADMINISTRADOR'
      || ['gcruz', 'acalix', 'jlara', 'tlopez'].includes(usuario?.nombreUsuario.trim().toLowerCase() ?? '');
  }

  public asignacionActual(
    pedido: PedidoResumen,
    articulo: ArticuloPedidoResumen,
  ): AsignacionArticulo | null {
    const identidad = this.identidadAsignacion(pedido, articulo);
    return identidad ? this.asignaciones().get(claveArticuloAsignado(identidad)) ?? null : null;
  }

  public nombreAsignado(pedido: PedidoResumen, articulo: ArticuloPedidoResumen): string {
    return this.asignacionActual(pedido, articulo)?.nombreAsignado ?? 'Sin asignar';
  }

  public valorAsignacionVisible(pedido: PedidoResumen, articulo: ArticuloPedidoResumen): string {
    const identidad = this.identidadAsignacion(pedido, articulo);
    const clave = identidad ? claveArticuloAsignado(identidad) : '';
    const usuarioAsignado = (clave && this.asignacionesDesbloqueadas().has(clave)
      ? this.seleccionesAsignacion().get(clave) ?? ''
      : this.asignacionActual(pedido, articulo)?.usuarioAsignado)
      ?? (identidad ? this.seleccionesAsignacion().get(claveArticuloAsignado(identidad)) : '')
      ?? (this.esUsuarioTommy() ? 'tlopez' : '');
    return usuarioAsignado && this.usuariosAsignables().some(({ usuario }) => usuario === usuarioAsignado)
      ? usuarioAsignado
      : '';
  }

  public asignacionConfirmada(pedido: PedidoResumen, articulo: ArticuloPedidoResumen): boolean {
    return Boolean(this.asignacionActual(pedido, articulo)?.usuarioAsignado);
  }

  public estadoTiempoSla(pedido: PedidoResumen): EstadoTiempoSla | null {
    const transcurrido = this.tiempoTranscurridoSlaMs(pedido);
    if (transcurrido === null) return null;
    if (transcurrido >= limiteSlaCriticaMs) return 'critica';
    if (transcurrido >= limiteSlaAdvertenciaMs) return 'advertencia';
    return 'ok';
  }

  public tiempoSla(pedido: PedidoResumen): string {
    const transcurrido = this.tiempoTranscurridoSlaMs(pedido);
    return transcurrido === null ? '—' : formatearDuracionPedido(transcurrido);
  }

  public modificadoPor(pedido: PedidoResumen): string {
    return pedido.modificado ? pedido.modificadoPor?.trim() || 'No disponible' : '—';
  }

  public puedeOperarArticulo(pedido: PedidoResumen, articulo: ArticuloPedidoResumen): boolean {
    const asignado = this.asignacionActual(pedido, articulo)?.usuarioAsignado?.trim().toLowerCase();
    if (!asignado) return true;
    const usuario = this.autenticacion.usuario();
    const nombreUsuario = usuario?.nombreUsuario.trim().toLowerCase();
    if (usuario?.codigoRol === 'ADMINISTRADOR' || nombreUsuario === 'gcruz') return true;
    if (nombreUsuario === 'acalix' || nombreUsuario === 'jlara') {
      return asignado === 'acalix' || asignado === 'jlara';
    }
    return nombreUsuario === asignado;
  }

  public asignacionGuardando(pedido: PedidoResumen, articulo: ArticuloPedidoResumen): boolean {
    const identidad = this.identidadAsignacion(pedido, articulo);
    return Boolean(identidad && this.asignacionesGuardando().has(claveArticuloAsignado(identidad)));
  }

  public cambiarSeleccionAsignacion(
    pedido: PedidoResumen,
    articulo: ArticuloPedidoResumen,
    usuarioAsignado: string,
  ): void {
    const identidad = this.identidadAsignacion(pedido, articulo);
    if (!identidad || !this.puedeAsignar()
      || (this.asignacionConfirmada(pedido, articulo) && !this.asignacionDesbloqueada(pedido, articulo))
      || this.asignacionGuardando(pedido, articulo)) return;
    if (usuarioAsignado
      && !this.usuariosAsignables().some(({ usuario }) => usuario === usuarioAsignado)) return;
    const clave = claveArticuloAsignado(identidad);
    const selecciones = new Map(this.seleccionesAsignacion());
    if (usuarioAsignado) selecciones.set(clave, usuarioAsignado); else selecciones.delete(clave);
    this.seleccionesAsignacion.set(selecciones);
    this.mensajeAsignacion.set('');
  }

  public responsablesPedido(pedido: PedidoResumen): string {
    const responsables = [...new Set(pedido.articulos.flatMap((articulo) => {
      const nombre = this.asignacionActual(pedido, articulo)?.nombreAsignado;
      return nombre ? [nombre] : [];
    }))];
    return responsables.length === 0 ? 'Sin asignar' : responsables.join(', ');
  }

  public asignacionDesbloqueada(pedido: PedidoResumen, articulo: ArticuloPedidoResumen): boolean {
    const identidad = this.identidadAsignacion(pedido, articulo);
    return Boolean(identidad && this.asignacionesDesbloqueadas().has(claveArticuloAsignado(identidad)));
  }

  public desbloquearAsignacion(pedido: PedidoResumen, articulo: ArticuloPedidoResumen): void {
    const identidad = this.identidadAsignacion(pedido, articulo);
    const actual = this.asignacionActual(pedido, articulo);
    if (!identidad || !actual?.usuarioAsignado || !actual.actualizadoEn || !this.puedeReasignar()) return;
    const clave = claveArticuloAsignado(identidad);
    this.seleccionesAsignacion.update((selecciones) => {
      const nuevas = new Map(selecciones);
      if (this.usuariosAsignables().some(({ usuario }) => usuario === actual.usuarioAsignado)) nuevas.set(clave, actual.usuarioAsignado!);
      else nuevas.delete(clave);
      return nuevas;
    });
    this.asignacionesDesbloqueadas.update((actuales) => new Set([...actuales, clave]));
    this.mensajeAsignacion.set('');
  }

  public puedeConfirmarReasignacion(pedido: PedidoResumen, articulo: ArticuloPedidoResumen): boolean {
    const identidad = this.identidadAsignacion(pedido, articulo);
    const actual = this.asignacionActual(pedido, articulo);
    if (!identidad || !actual?.actualizadoEn || !this.puedeReasignar() || !this.asignacionDesbloqueada(pedido, articulo) || this.asignacionGuardando(pedido, articulo)) return false;
    const seleccion = this.seleccionesAsignacion().get(claveArticuloAsignado(identidad));
    return Boolean(seleccion && seleccion !== actual.usuarioAsignado && this.usuariosAsignables().some(({ usuario }) => usuario === seleccion));
  }

  public reasignarAsignacion(pedido: PedidoResumen, articulo: ArticuloPedidoResumen): void {
    if (!this.puedeReasignar() || this.asignacionGuardando(pedido, articulo)) return;
    if (this.asignacionDesbloqueada(pedido, articulo)) this.confirmarReasignacion(pedido, articulo);
    else this.desbloquearAsignacion(pedido, articulo);
  }

  public puedeGuardarAsignacion(pedido: PedidoResumen, articulo: ArticuloPedidoResumen): boolean {
    return this.asignacionConfirmada(pedido, articulo)
      ? this.puedeConfirmarReasignacion(pedido, articulo)
      : this.puedeConfirmarAsignacion(pedido, articulo);
  }

  public guardarAsignacion(pedido: PedidoResumen, articulo: ArticuloPedidoResumen): void {
    if (this.asignacionConfirmada(pedido, articulo)) this.confirmarReasignacion(pedido, articulo);
    else this.confirmarAsignacion(pedido, articulo);
  }

  public confirmarReasignacion(pedido: PedidoResumen, articulo: ArticuloPedidoResumen): void {
    const identidad = this.identidadAsignacion(pedido, articulo);
    const actual = this.asignacionActual(pedido, articulo);
    if (!identidad || !actual?.actualizadoEn || !this.puedeConfirmarReasignacion(pedido, articulo)) return;
    const clave = claveArticuloAsignado(identidad);
    const usuarioAsignado = this.seleccionesAsignacion().get(clave)!;
    this.asignacionesGuardando.update((actuales) => new Set([...actuales, clave]));
    this.versionAsignaciones += 1;
    this.asignacionesService.reasignar(identidad, usuarioAsignado, actual.actualizadoEn)
      .pipe(takeUntilDestroyed(this.destruirRef)).subscribe({
        next: ({ datos }) => {
          this.asignaciones.update((asignaciones) => new Map(asignaciones).set(clave, datos));
          this.bloquearAsignacion(clave);
          this.finalizarGuardadoAsignacion(clave);
          this.mensajeAsignacionEsError.set(false);
          this.mensajeAsignacion.set('Reasignación guardada.');
        },
        error: (error: unknown) => {
          const asignacionActual = this.obtenerAsignacionDesdeError(error, identidad);
          if (asignacionActual?.actualizadoEn) {
            this.asignaciones.update((asignaciones) => new Map(asignaciones).set(clave, asignacionActual));
            this.bloquearAsignacion(clave);
            this.mensajeAsignacion.set('La asignación cambió. Revise el responsable actual.');
          } else this.mensajeAsignacion.set('No fue posible guardar la reasignación.');
          this.mensajeAsignacionEsError.set(true);
          this.finalizarGuardadoAsignacion(clave);
        },
      });
  }

  public puedeConfirmarAsignacion(
    pedido: PedidoResumen,
    articulo: ArticuloPedidoResumen,
  ): boolean {
    const identidad = this.identidadAsignacion(pedido, articulo);
    if (!identidad || !this.puedeAsignar() || this.asignacionConfirmada(pedido, articulo)
      || this.asignacionGuardando(pedido, articulo)) return false;
    const seleccion = this.seleccionesAsignacion().get(claveArticuloAsignado(identidad))
      ?? (this.esUsuarioTommy() ? 'tlopez' : '');
    return Boolean(seleccion
      && this.usuariosAsignables().some(({ usuario }) => usuario === seleccion));
  }

  public confirmarAsignacion(
    pedido: PedidoResumen,
    articulo: ArticuloPedidoResumen,
  ): void {
    const identidad = this.identidadAsignacion(pedido, articulo);
    if (!identidad || !this.puedeConfirmarAsignacion(pedido, articulo)) return;
    const clave = claveArticuloAsignado(identidad);
    const usuarioAsignado = this.seleccionesAsignacion().get(clave)
      ?? (this.esUsuarioTommy() ? 'tlopez' : '');
    if (!usuarioAsignado) return;
    this.asignacionesGuardando.update((actuales) => new Set([...actuales, clave]));
    this.mensajeAsignacion.set('');
    this.mensajeAsignacionEsError.set(false);
    this.versionAsignaciones += 1;

    this.asignacionesService.guardar(identidad, usuarioAsignado)
      .pipe(takeUntilDestroyed(this.destruirRef))
      .subscribe({
        next: ({ datos }) => {
          const guardadas = new Map(this.asignaciones());
          guardadas.set(clave, datos);
          this.asignaciones.set(guardadas);
          this.eliminarSeleccionAsignacion(clave);
          this.finalizarGuardadoAsignacion(clave);
          this.mensajeAsignacion.set('Asignación guardada.');
        },
        error: (error: unknown) => {
          const asignacionGanadora = this.obtenerAsignacionDesdeError(error, identidad);
          if (asignacionGanadora) {
            const actuales = new Map(this.asignaciones());
            actuales.set(clave, asignacionGanadora);
            this.asignaciones.set(actuales);
            this.eliminarSeleccionAsignacion(clave);
            this.mensajeAsignacion.set(
              `Esta partida ya fue asignada a ${asignacionGanadora.nombreAsignado}.`,
            );
          } else {
            this.mensajeAsignacion.set('No fue posible guardar la asignación.');
          }
          this.finalizarGuardadoAsignacion(clave);
          this.mensajeAsignacionEsError.set(true);
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

  public todasTransferenciasSeleccionadas(grupo: GrupoPedidos['clave']): boolean {
    const disponibles = this.clavesVisiblesGrupo(grupo);
    const seleccionadas = this.lineasSeleccionadasTransferencia();
    return disponibles.length > 0 && disponibles.every((clave) => seleccionadas.has(clave));
  }

  public puedeSeleccionarTransferencias(grupo: GrupoPedidos['clave']): boolean {
    return this.clavesVisiblesGrupo(grupo).length > 0 && !this.transfiriendo();
  }

  public seleccionarTodasTransferencias(grupo: GrupoPedidos['clave']): void {
    if (!this.puedeSeleccionarTransferencias(grupo)) return;
    const disponibles = this.clavesVisiblesGrupo(grupo);
    const seleccionar = !disponibles.every((clave) => this.lineasSeleccionadasTransferencia().has(clave));
    const nuevas = new Set(this.lineasSeleccionadasTransferencia());
    disponibles.forEach((clave) => seleccionar ? nuevas.add(clave) : nuevas.delete(clave));
    this.lineasSeleccionadasTransferencia.set(nuevas);
    this.mensajeTransferencia.set('');
  }

  public estaSeleccionadoParaImpresion(
    pedido: PedidoResumen,
    articulo: ArticuloPedidoResumen,
    indice: number,
  ): boolean {
    return this.lineasSeleccionadasImpresion()
      .has(this.claveEstableLinea(pedido, articulo, indice));
  }

  public alternarSeleccionImpresion(
    pedido: PedidoResumen,
    articulo: ArticuloPedidoResumen,
    indice: number,
    seleccionado: boolean,
  ): void {
    if (seleccionado && !this.puedeOperarArticulo(pedido, articulo)) return;
    const nuevas = new Set(this.lineasSeleccionadasImpresion());
    const clave = this.claveEstableLinea(pedido, articulo, indice);
    if (seleccionado) nuevas.add(clave); else nuevas.delete(clave);
    this.lineasSeleccionadasImpresion.set(nuevas);
    this.mensajeImpresion.set('');
  }

  public todasImpresionesSeleccionadas(grupo: GrupoPedidos['clave']): boolean {
    const disponibles = this.clavesVisiblesGrupo(grupo);
    const seleccionadas = this.lineasSeleccionadasImpresion();
    return disponibles.length > 0 && disponibles.every((clave) => seleccionadas.has(clave));
  }

  public puedeSeleccionarImpresiones(grupo: GrupoPedidos['clave']): boolean {
    return this.clavesVisiblesGrupo(grupo).length > 0
      && !this.preparandoImpresion() && !this.confirmarImpresion() && !this.guardandoImpresion();
  }

  public seleccionarTodasImpresiones(grupo: GrupoPedidos['clave']): void {
    if (!this.puedeSeleccionarImpresiones(grupo)) return;
    const disponibles = this.clavesVisiblesGrupo(grupo);
    const seleccionar = !disponibles.every((clave) => this.lineasSeleccionadasImpresion().has(clave));
    const nuevas = new Set(this.lineasSeleccionadasImpresion());
    disponibles.forEach((clave) => seleccionar ? nuevas.add(clave) : nuevas.delete(clave));
    this.lineasSeleccionadasImpresion.set(nuevas);
    this.mensajeImpresion.set('');
  }

  public imprimirSeleccionados(): void {
    if (this.preparandoImpresion() || this.confirmarImpresion() || this.guardandoImpresion()
      || this.lineasSeleccionadasImpresion().size === 0) return;
    const elegidos = this.obtenerLineasSeleccionadasImpresion();
    if (elegidos.length === 0) {
      this.limpiarSeleccionImpresion();
      return;
    }
    this.loteImpresion = elegidos.map(({ pedido, articulo }) => ({
      idOrigen: pedido.idOrigen,
      identificadorDetalle: articulo.identificadorDetalle!.trim(),
      codigoArticulo: articulo.codigoArticulo?.trim() || null,
    }));
    this.articulosImpresion.set(elegidos.map(({ pedido, articulo }) => ({
      idPedido: pedido.idOrigen,
      numeroPedido: pedido.numeroPedido,
      codigo: articulo.codigoArticulo?.trim() || '—',
      descripcion: articulo.descripcion?.trim() || '—',
      cantidad: articulo.cantidad,
      bodega: articulo.codigoAlmacen?.trim() || '—',
      vendedor: pedido.nombreVendedor?.trim() || 'Sin vendedor',
      asignadoA: this.asignacionActual(pedido, articulo)?.nombreAsignado?.trim()
        || articulo.usuarioAsignado?.trim() || 'Sin asignar',
    })));
    this.fechaHoraImpresion.set(formatearFechaHoraHonduras(new Date(), true));
    this.errorRegistroImpresion.set('');
    this.mensajeImpresion.set('');
    this.preparandoImpresion.set(true);
    this.temporizadorImpresion = setTimeout(() => {
      this.esperandoCierreImpresion = true;
      try {
        window.print();
      } catch {
        this.descartarRegistroImpresion();
        this.mensajeImpresion.set('No se pudo abrir la impresión.');
      }
    });
  }

  @HostListener('window:afterprint')
  public alCerrarImpresion(): void {
    if (!this.esperandoCierreImpresion || !this.loteImpresion) return;
    this.esperandoCierreImpresion = false;
    this.preparandoImpresion.set(false);
    this.confirmarImpresion.set(true);
  }

  public descartarRegistroImpresion(): void {
    if (this.guardandoImpresion()) return;
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
    this.impresionesService.registrar(lote)
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

  private clavesVisiblesGrupo(grupo: GrupoPedidos['clave']): string[] {
    return this.pedidosGrupo(grupo).flatMap((pedido) => pedido.articulos.flatMap((articulo, indice) =>
      articulo.identificadorDetalle?.trim() && this.puedeOperarArticulo(pedido, articulo)
        ? [this.claveEstableLinea(pedido, articulo, indice)]
        : []));
  }

  private pedidosGrupo(grupo: GrupoPedidos['clave']): PedidoResumen[] {
    return grupo === 'normales' ? this.pedidos() : this.pedidosEspeciales();
  }

  private obtenerLineasSeleccionadasImpresion(): {
    pedido: PedidoResumen;
    articulo: ArticuloPedidoResumen;
  }[] {
    const seleccionadas = this.lineasSeleccionadasImpresion();
    const agregadas = new Set<string>();
    return [...this.pedidos(), ...this.pedidosEspeciales()].flatMap((pedido) =>
      pedido.articulos.flatMap((articulo, indice) => {
        const clave = this.claveEstableLinea(pedido, articulo, indice);
        if (!articulo.identificadorDetalle?.trim() || !this.puedeOperarArticulo(pedido, articulo)
          || !seleccionadas.has(clave) || agregadas.has(clave)) return [];
        agregadas.add(clave);
        return [{ pedido, articulo }];
      }));
  }

  private limpiarSeleccionesOperativas(): void {
    this.limpiarSeleccionTransferencia();
    this.limpiarSeleccionImpresion();
  }

  private limpiarSeleccionTransferencia(): void {
    this.lineasSeleccionadasTransferencia.set(new Set());
  }

  private limpiarSeleccionImpresion(): void {
    this.lineasSeleccionadasImpresion.set(new Set());
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
          const normales = this.retirarLineasTransferidas(this.pedidos(), transferidas);
          const especiales = this.retirarLineasTransferidas(this.pedidosEspeciales(), transferidas);
          this.pedidos.set(normales.pedidos);
          this.pedidosEspeciales.set(especiales.pedidos);
          if (normales.registrosRetirados > 0) this.totalRegistros.update((total) =>
            Math.max(0, total - normales.registrosRetirados));
          if (especiales.registrosRetirados > 0) this.totalRegistrosEspeciales.update((total) =>
            Math.max(0, total - especiales.registrosRetirados));
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
        const revisionConsulta = this.revisionFiltros;
        const mostrarCargaInicial = this.primeraConsulta;
        if (mostrarCargaInicial) this.cargando.set(true);
        else this.actualizando.set(true);
        if (!esAutomatica) this.error.set(null);
        return forkJoin({
          normales: this.pedidosService.obtenerPedidos({
            ...filtrosConsulta,
            pagina: this.pagina(),
            clasificacion: 'normal',
          }).pipe(
            map((respuesta) => ({ respuesta, error: null as unknown })),
            catchError((error: unknown) => of({ respuesta: null, error })),
          ),
          especiales: this.pedidosService.obtenerPedidos({
            ...filtrosConsulta,
            pagina: this.paginaEspeciales(),
            clasificacion: 'especial',
          }).pipe(
            map((respuesta) => ({ respuesta, error: null as unknown })),
            catchError((error: unknown) => of({ respuesta: null, error })),
          ),
        }).pipe(
          map((respuestas) => ({ respuestas, esAutomatica, filtrosConsulta, revisionConsulta })),
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
    ).subscribe(({ respuestas, esAutomatica, filtrosConsulta, revisionConsulta }) => {
      if (revisionConsulta !== this.revisionFiltros) return;
      const normales = respuestas.normales.respuesta;
      const especiales = respuestas.especiales.respuesta;
      if (!normales && !especiales) {
        const errorConsulta = respuestas.normales.error ?? respuestas.especiales.error;
        if (this.primeraConsulta || !esAutomatica) {
          this.error.set(obtenerMensajeError(errorConsulta, 'listado'));
        }
        this.cargando.set(false);
        this.actualizando.set(false);
        this.primeraConsulta = false;
        return;
      }
      if (normales && !esAutomatica && normales.datos.length === 0 && this.pagina() > 1) {
        void this.actualizarRuta(this.pagina() - 1);
        return;
      }
      if (normales) {
        this.notificaciones.procesarRespuesta(normales.datos, filtrosConsulta, !esAutomatica);
        this.pedidos.set(normales.datos);
        this.cargarAsignaciones(normales.datos);
        this.pagina.set(normales.paginacion.pagina);
        this.hayMas.set(normales.paginacion.hayMas);
        this.totalRegistros.set(normales.paginacion.totalRegistros ?? normales.datos.length);
      }
      if (especiales) {
        this.pedidosEspeciales.set(especiales.datos);
        this.paginaEspeciales.set(especiales.paginacion.pagina);
        this.totalRegistrosEspeciales.set(especiales.paginacion.totalRegistros ?? especiales.datos.length);
        this.cargarAsignaciones(especiales.datos);
      }
      const pedidosVisibles = [...this.pedidos(), ...this.pedidosEspeciales()];
      this.reconciliarSeleccionTransferencia(pedidosVisibles);
      this.reconciliarSeleccionImpresion(pedidosVisibles);
      this.ultimaActualizacion.set(new Date());
      this.cargando.set(false);
      this.actualizando.set(false);
      this.primeraConsulta = false;
    });
  }

  private reconciliarSeleccionImpresion(pedidos: PedidoResumen[]): void {
    const visibles = new Set<string>();
    for (const pedido of pedidos) {
      pedido.articulos.forEach((articulo, indice) => {
        visibles.add(this.claveEstableLinea(pedido, articulo, indice));
      });
    }
    this.lineasSeleccionadasImpresion.set(new Set(
      [...this.lineasSeleccionadasImpresion()].filter((clave) => visibles.has(clave)),
    ));
  }

  private iniciarActualizacionFacturadosPendientes(): void {
    merge(
      of(0),
      timer(intervaloActualizacionPedidosMs, intervaloActualizacionPedidosMs),
    ).pipe(
      exhaustMap(() => this.facturadosPendientesService.listar({
        numeroPedido: '', fechaDesde: '', fechaHasta: '', codigosAlmacen: [],
        pagina: 1, cantidadPorPagina: 1, vista: 'articulos',
      }).pipe(catchError(() => of(null)))),
      takeUntilDestroyed(this.destruirRef),
    ).subscribe((respuesta) => this.cantidadFacturadosPendientes.set(
      respuesta?.paginacion.totalRegistros ?? 0,
    ));
  }

  private construirFiltros(): FiltrosPedidos {
    const filtros: FiltrosPedidos = {
      pagina: this.pagina(),
      cantidadPorPagina: this.filtrosFormulario.cantidadPorPagina,
      vista: this.vista(),
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
      paginaEspeciales: this.paginaEspeciales(),
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
    this.vista.set(parametros.get('vista') === 'pedido' ? 'pedido' : 'articulos');
    this.pagina.set(
      Number.isInteger(paginaSolicitada) && paginaSolicitada > 0 ? paginaSolicitada : 1,
    );
    const paginaEspecialSolicitada = Number(parametros.get('paginaEspeciales') ?? guardados.pagina);
    this.paginaEspeciales.set(Number.isInteger(paginaEspecialSolicitada) && paginaEspecialSolicitada > 0 ? paginaEspecialSolicitada : 1);
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
    this.limpiarSeleccionesOperativas();
    const navego = await this.enrutador.navigate([], {
      relativeTo: this.ruta,
      queryParams: this.construirParametros(pagina),
    });
    if (!navego) {
      this.pagina.set(pagina);
      this.filtrosAplicados = this.copiarFiltros(this.construirFiltros());
      ++this.revisionFiltros;
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
    const agregadas = new Set<string>();
    for (const pedido of [...this.pedidos(), ...this.pedidosEspeciales()]) {
      pedido.articulos.forEach((articulo, indice) => {
        const identificadorDetalle = articulo.identificadorDetalle?.trim();
        const clave = this.claveLineaTransferencia(pedido, articulo, indice);
        if (identificadorDetalle && seleccionadas.has(clave) && !agregadas.has(clave)) {
          agregadas.add(clave);
          resultado.push({ idOrigen: pedido.idOrigen, identificadorDetalle });
        }
      });
    }
    return resultado;
  }

  private retirarLineasTransferidas(
    pedidos: PedidoResumen[],
    transferidas: ReadonlySet<string>,
  ): { pedidos: PedidoResumen[]; registrosRetirados: number } {
    let registrosRetirados = 0;
    const restantes = pedidos.map((pedido) => ({
      ...pedido,
      articulos: pedido.articulos.filter((articulo) => {
        const identidad = articulo.identificadorDetalle?.trim();
        return !identidad || !transferidas.has(`${pedido.idOrigen}\u0000${identidad}`);
      }),
    })).filter((pedido) => {
      if (pedido.articulos.length > 0) return true;
      registrosRetirados += 1;
      return false;
    });
    return { pedidos: restantes, registrosRetirados };
  }

  private cargarUsuariosAsignables(): void {
    this.asignacionesService.obtenerUsuarios()
      .pipe(takeUntilDestroyed(this.destruirRef))
      .subscribe({
        next: ({ datos, puedeAsignar, puedeAsignarTodos, puedeReasignar }) => {
          const usuarioActual = this.autenticacion.usuario()?.nombreUsuario.trim().toLowerCase();
          const asignaTodos = puedeAsignarTodos
            && (this.autenticacion.usuario()?.codigoRol === 'ADMINISTRADOR' || usuarioActual === 'gcruz');
          const visibles = asignaTodos
            ? datos
            : usuarioActual === 'acalix' || usuarioActual === 'jlara' || usuarioActual === 'tlopez'
              ? datos.filter(({ usuario }) => usuarioActual === 'tlopez'
                ? usuario.trim().toLowerCase() === 'tlopez'
                : ['jlara', 'acalix'].includes(usuario.trim().toLowerCase()))
              : [];
          this.usuariosAsignables.set(visibles);
          this.puedeAsignarTodos.set(asignaTodos);
          this.puedeReasignar.set(Boolean(puedeReasignar));
          this.puedeAsignar.set(puedeAsignar && this.puedeAsignarPedidos() && visibles.length > 0);
          this.usuariosAsignablesCargados = true;
          this.cargarAsignaciones(this.pedidos());
        },
        error: () => {
          this.usuariosAsignables.set([]);
          this.puedeAsignar.set(false);
          this.puedeAsignarTodos.set(false);
          this.puedeReasignar.set(false);
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
    const consulta = this.asignacionesService.consultar(lineas);
    consulta
      .pipe(takeUntilDestroyed(this.destruirRef))
      .subscribe({
        next: ({ datos }) => {
          if (versionConsulta !== this.versionAsignaciones) return;
          const actuales = new Map(this.asignaciones());
          const selecciones = new Map(this.seleccionesAsignacion());
          datos.forEach((asignacion) => {
            const clave = claveArticuloAsignado(asignacion);
            if (this.asignacionesDesbloqueadas().has(clave)) return;
            actuales.set(clave, asignacion);
            if (asignacion.usuarioAsignado) selecciones.delete(clave);
            else if (this.autenticacion.usuario()?.nombreUsuario.trim().toLowerCase() === 'tlopez'
              && asignacion.idOrigen.toUpperCase().startsWith('R1:TCIR01:')) {
              selecciones.set(clave, 'tlopez');
            }
          });
          this.asignaciones.set(actuales);
          this.seleccionesAsignacion.set(selecciones);
        },
        error: () => undefined,
      });
  }

  private bloquearAsignacion(clave: string): void {
    this.eliminarSeleccionAsignacion(clave);
    this.asignacionesDesbloqueadas.update((actuales) => {
      const nuevos = new Set(actuales);
      nuevos.delete(clave);
      return nuevos;
    });
  }

  private iniciarRelojSla(): void {
    timer(0, intervaloRelojSlaMs)
      .pipe(takeUntilDestroyed(this.destruirRef))
      .subscribe(() => this.ahoraSlaMs.set(Date.now() + this.desfaseRelojServidorMs));
  }

  private sincronizarRelojSla(horaServidor: string | null | undefined): void {
    if (!horaServidor) return;
    const servidorMs = Date.parse(horaServidor);
    if (!Number.isFinite(servidorMs)) return;
    this.desfaseRelojServidorMs = servidorMs - Date.now();
    this.ahoraSlaMs.set(servidorMs);
  }

  private tiempoTranscurridoSlaMs(pedido: PedidoResumen): number | null {
    const duracion = duracionPedidoMs(pedido, this.ahoraSlaMs());
    return duracion === null ? null : Math.max(0, duracion);
  }

  private identidadAsignacion(
    pedido: PedidoResumen,
    articulo: ArticuloPedidoResumen,
  ): IdentidadArticuloAsignacion | null {
    const idOrigen = pedido.idOrigen.trim();
    const identificadorDetalle = articulo.identificadorDetalle?.trim();
    return idOrigen && identificadorDetalle ? { idOrigen, identificadorDetalle } : null;
  }

  private esTommyCircunvalacion(pedido: PedidoResumen): boolean {
    return this.esUsuarioTommy()
      && pedido.idOrigen.toUpperCase().startsWith('R1:TCIR01:');
  }

  private esUsuarioTommy(): boolean {
    return this.autenticacion.usuario()?.nombreUsuario.trim().toLowerCase() === 'tlopez'
      || (this.usuariosAsignables().length === 1
        && this.usuariosAsignables()[0]?.usuario.trim().toLowerCase() === 'tlopez');
  }

  private finalizarGuardadoAsignacion(clave: string): void {
    this.asignacionesGuardando.update((actuales) => {
      const nuevos = new Set(actuales);
      nuevos.delete(clave);
      return nuevos;
    });
  }

  private eliminarSeleccionAsignacion(clave: string): void {
    const selecciones = new Map(this.seleccionesAsignacion());
    selecciones.delete(clave);
    this.seleccionesAsignacion.set(selecciones);
  }

  private obtenerAsignacionDesdeError(
    error: unknown,
    identidad: IdentidadArticuloAsignacion,
  ): AsignacionArticulo | null {
    if (!error || typeof error !== 'object' || !('error' in error)) return null;
    const cuerpo = error.error;
    if (!cuerpo || typeof cuerpo !== 'object' || !('datos' in cuerpo)) return null;
    const datos = cuerpo.datos;
    if (!datos || typeof datos !== 'object') return null;
    const posible = datos as Partial<AsignacionArticulo>;
    if (posible.idOrigen !== identidad.idOrigen
      || posible.identificadorDetalle !== identidad.identificadorDetalle
      || typeof posible.usuarioAsignado !== 'string'
      || typeof posible.nombreAsignado !== 'string') return null;
    return {
      ...identidad,
      usuarioAsignado: posible.usuarioAsignado,
      nombreAsignado: posible.nombreAsignado,
      asignadoEn: typeof posible.asignadoEn === 'string' ? posible.asignadoEn : null,
      actualizadoEn: typeof posible.actualizadoEn === 'string' ? posible.actualizadoEn : null,
    };
  }

}
