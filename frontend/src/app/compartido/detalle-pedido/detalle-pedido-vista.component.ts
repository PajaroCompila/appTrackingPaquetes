import {
  Component,
  DestroyRef,
  EventEmitter,
  HostListener,
  Input,
  Injector,
  OnChanges,
  Output,
  SimpleChanges,
  inject,
  computed,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, concatMap, from, of, tap, throwError, toArray } from 'rxjs';
import { AsignacionesService } from '../asignaciones/asignaciones.service';
import { claveArticuloAsignado, type AsignacionArticulo, type TecnicoAsignable } from '../asignaciones/asignacion.interface';
import { AutenticacionService } from '../../funcionalidades/autenticacion/autenticacion.service';
import { AsignacionImpresionComponent } from './asignacion-impresion.component';
import { EncabezadoArticulosDetalleComponent } from './encabezado-articulos-detalle.component';
import { AccionSeleccionDetalleComponent, SelectorTransferenciaDetalleComponent } from './controles-seleccion-detalle.component';
import type {
  ArticuloDetalleVisual,
  ConfiguracionDetallePedido,
  ErrorDetalleVisual,
  ModificacionPedidoVisual,
  PedidoDetalleVisual,
} from './detalle-pedido-vista.interface';
import { formatearFechaHoraHonduras } from '../fechas/fecha-honduras';
import { CodigoArticuloInventarioDirective } from '../inventario/codigo-articulo-inventario.directive';
import { ImpresionesService } from '../impresiones/impresiones.service';
import {
  claveArticuloImpreso,
  type EstadoImpresionArticulo,
  type IdentidadArticuloImpresion,
  type LineaRegistroImpresion,
} from '../impresiones/impresion.interface';
import { ConfirmacionImpresionComponent } from '../impresiones/confirmacion-impresion.component';
import {
  VistaImpresionPedidoComponent,
  type ArticuloImpresionPedido,
} from '../../funcionalidades/pedidos/vista-impresion-pedido.component';

@Component({
  selector: 'app-detalle-pedido-vista',
  imports: [CodigoArticuloInventarioDirective, VistaImpresionPedidoComponent, ConfirmacionImpresionComponent, AsignacionImpresionComponent, EncabezadoArticulosDetalleComponent, AccionSeleccionDetalleComponent, SelectorTransferenciaDetalleComponent],
  templateUrl: './detalle-pedido-vista.component.html',
  styleUrl: './detalle-pedido-vista.component.css',
})
export class DetallePedidoVistaComponent implements OnChanges {
  private readonly impresionesService = inject(ImpresionesService);
  private readonly destruirRef = inject(DestroyRef);
  private readonly inyector = inject(Injector);

  @Input({ required: true }) public configuracion!: ConfiguracionDetallePedido;
  @Input() public pedido: PedidoDetalleVisual | null = null;
  @Input() public cargando = false;
  @Input() public error: ErrorDetalleVisual | null = null;
  @Input() public permitirTransferencia = false;
  @Input() public revisionTransferencia = 0;
  @Input() public revisionRefresco = 0;
  @Input() public mensajeTransferencia = '';
  @Input() public set transfiriendo(valor: boolean) { this.transferenciaEnCurso.set(valor); }
  public readonly transferenciaEnCurso = signal(false);
  public readonly lineasSeleccionadasTransferencia = signal<ReadonlySet<string>>(new Set());
  @Output() public readonly transferirSeleccionados = new EventEmitter<readonly IdentidadArticuloImpresion[]>();
  @Output() public readonly regresar = new EventEmitter<void>();
  @Output() public readonly reintentar = new EventEmitter<void>();
  @Output() public readonly asignacionesActualizadas = new EventEmitter<readonly AsignacionArticulo[]>();
  public readonly bodegasSeleccionadas = signal<ReadonlySet<string>>(new Set());
  public readonly solicitarResponsable = signal(false);
  public readonly consultandoResponsables = signal(false);
  public readonly asignandoResponsables = signal(false);
  public readonly articulosSinResponsable = signal<readonly ArticuloDetalleVisual[]>([]);
  public readonly usuariosAsignablesImpresion = signal<readonly TecnicoAsignable[]>([]);
  public readonly errorAsignacionImpresion = signal('');
  public readonly bloqueoHerramientas = computed(() => this.solicitarResponsable() || this.consultandoResponsables()
    || this.asignandoResponsables() || this.preparandoImpresion() || this.confirmarImpresion() || this.guardandoImpresion() || this.transferenciaEnCurso());
  private versionAsignacion = 0;
  private firmaAsignacion = '';
  public readonly lineasSeleccionadas = signal<ReadonlySet<string>>(new Set());
  public readonly lineasImpresas = signal<ReadonlySet<string>>(new Set());
  public readonly articulosImpresion = signal<readonly ArticuloImpresionPedido[]>([]);
  public readonly fechaHoraImpresion = signal('');
  public readonly preparandoImpresion = signal(false);
  public readonly mensajeImpresion = signal('');
  public readonly confirmarImpresion = signal(false);
  public readonly guardandoImpresion = signal(false);
  public readonly errorRegistroImpresion = signal('');
  private readonly estadosImpresion = signal<ReadonlyMap<string, EstadoImpresionArticulo>>(new Map());
  private loteImpresion: LineaRegistroImpresion[] | null = null;
  private esperandoCierreImpresion = false;
  private versionConsultaImpresion = 0;
  private temporizadorImpresion?: ReturnType<typeof setTimeout>;

  public constructor() {
    this.destruirRef.onDestroy(() => {
      clearTimeout(this.temporizadorImpresion);
      this.loteImpresion = null;
      this.esperandoCierreImpresion = false;
    });
  }
  public readonly gruposCambios = [
    { tipo: 'ELIMINADO', titulo: 'Artículos eliminados' },
    { tipo: 'AGREGADO', titulo: 'Artículos agregados' },
    { tipo: 'CANTIDAD', titulo: 'Cambios de cantidad' },
    { tipo: 'BODEGA', titulo: 'Cambios de bodega' },
  ] as const;

  public ngOnChanges(cambios: SimpleChanges): void {
    if (cambios['revisionTransferencia']) this.lineasSeleccionadasTransferencia.set(new Set());
    const cambio = cambios['pedido'];
    if (!cambio) {
      if (cambios['revisionRefresco'] && this.pedido) this.cargarEstadoImpresion(true);
      return;
    }
    const mismoPedido = cambio.previousValue?.idOrigen === cambio.currentValue?.idOrigen;
    if (!mismoPedido) {
      this.lineasSeleccionadasTransferencia.set(new Set());
      this.descartarRegistroImpresion(true);
      this.cancelarAsignacionImpresion(true);
    }
    const anteriores = new Set<string>((cambio.previousValue?.articulos ?? []).map((a: ArticuloDetalleVisual) => this.bodegaArticulo(a)));
    const actuales = this.bodegasDelPedido().map(({ codigo }) => codigo);
    this.bodegasSeleccionadas.set(new Set(actuales.filter(codigo => !mismoPedido || !anteriores.has(codigo) || this.bodegasSeleccionadas().has(codigo))));
    this.conciliarSeleccionVisible();
    this.cargarEstadoImpresion(mismoPedido);
  }

  public valor(valor: string | number | null | undefined): string | number {
    return valor === null || valor === undefined || String(valor).trim() === ''
      ? 'No disponible'
      : valor;
  }

  public fecha(valor: string | null | undefined): string {
    return valor ? formatearFechaHoraHonduras(valor) : 'No disponible';
  }

  public totalUnidades(articulos: ArticuloDetalleVisual[]): number | string {
    const cantidades = articulos.map(({ cantidad }) => cantidad)
      .filter((cantidad): cantidad is number => cantidad !== null);
    return cantidades.length > 0
      ? cantidades.reduce((total, cantidad) => total + cantidad, 0)
      : 'No disponible';
  }

  public textoArticulos(cantidad: number): string {
    return `${cantidad} ${cantidad === 1 ? 'artículo' : 'artículos'}`;
  }

  public tienePartida(articulos: ArticuloDetalleVisual[]): boolean {
    return articulos.some(({ numeroPartida }) => this.tieneValor(numeroPartida));
  }

  public tieneEstadoEntrega(articulos: ArticuloDetalleVisual[]): boolean {
    return articulos.some(({ estadoEntrega }) => this.tieneValor(estadoEntrega));
  }

  public tieneDatosDespacho(articulos: ArticuloDetalleVisual[]): boolean {
    return articulos.some(({ fechaDespacho, usuario }) =>
      this.tieneValor(fechaDespacho) || this.tieneValor(usuario));
  }

  public tieneResponsable(articulos: ArticuloDetalleVisual[]): boolean {
    return articulos.some(({ responsable }) => this.tieneValor(responsable));
  }

  public cambios(
    modificaciones: ModificacionPedidoVisual[],
    tipo: ModificacionPedidoVisual['tipo'],
  ): ModificacionPedidoVisual[] {
    return modificaciones.filter((cambio) => cambio.tipo === tipo);
  }

  public descripcionCambio(cambio: ModificacionPedidoVisual): string {
    const articulo = [cambio.codigoArticulo, cambio.descripcion].filter(Boolean).join(' · ')
      || `Partida ${cambio.identificadorDetalle}`;
    if (cambio.tipo === 'AGREGADO') {
      return `${articulo} · Cantidad ${this.valor(cambio.cantidadNueva)} · Bodega ${this.valor(cambio.codigoAlmacenNuevo)}`;
    }
    if (cambio.tipo === 'ELIMINADO') {
      return `${articulo} · Cantidad ${this.valor(cambio.cantidadAnterior)} · Bodega ${this.valor(cambio.codigoAlmacenAnterior)}`;
    }
    if (cambio.tipo === 'CANTIDAD') {
      return `${articulo} · ${this.valor(cambio.cantidadAnterior)} → ${this.valor(cambio.cantidadNueva)}`;
    }
    return `${articulo} · ${this.valor(cambio.codigoAlmacenAnterior)} → ${this.valor(cambio.codigoAlmacenNuevo)}`;
  }

  public puedeImprimir(articulo: ArticuloDetalleVisual): boolean {
    return articulo.operacionPermitida !== false && Boolean(this.identidad(articulo));
  }

  public bodegasDelPedido(): { codigo: string; nombre: string }[] {
    const bodegas = new Map<string, string>();
    this.pedido?.articulos.forEach(a => bodegas.set(this.bodegaArticulo(a), a.nombreAlmacen?.trim() || ''));
    return [...bodegas].map(([codigo, nombre]) => ({ codigo, nombre }));
  }

  public articulosVisibles(): ArticuloDetalleVisual[] {
    return this.pedido?.articulos.filter(a => !this.configuracion.herramientasImpresionPendiente
      || this.bodegasSeleccionadas().has(this.bodegaArticulo(a))) ?? [];
  }

  public cambiarBodega(codigo: string, activa: boolean): void {
    if (this.bloqueoHerramientas()) return;
    const seleccion = new Set(this.bodegasSeleccionadas());
    if (activa) seleccion.add(codigo); else seleccion.delete(codigo);
    this.bodegasSeleccionadas.set(seleccion);
    this.conciliarSeleccionVisible();
  }

  public todosSeleccionados(): boolean {
    const disponibles = this.articulosVisibles().filter(a => this.puedeImprimir(a));
    return disponibles.length > 0 && disponibles.every(a => this.estaSeleccionado(a));
  }

  public seleccionarTodos(): void {
    if (this.bloqueoHerramientas()) return;
    const seleccionar = !this.todosSeleccionados();
    this.articulosVisibles().filter(a => this.puedeImprimir(a)).forEach(a => this.alternarSeleccion(a, seleccionar));
  }

  public estaSeleccionado(articulo: ArticuloDetalleVisual): boolean {
    const identidad = this.identidad(articulo);
    return Boolean(identidad && this.lineasSeleccionadas().has(claveArticuloImpreso(identidad)));
  }

  public alternarSeleccion(articulo: ArticuloDetalleVisual, seleccionado: boolean): void {
    if (this.configuracion.herramientasImpresionPendiente && (this.bloqueoHerramientas()
      || (seleccionado && (!this.puedeImprimir(articulo) || !this.articulosVisibles().includes(articulo))))) return;
    const identidad = this.identidad(articulo);
    if (!identidad) return;
    const nuevas = new Set(this.lineasSeleccionadas());
    const clave = claveArticuloImpreso(identidad);
    if (seleccionado) nuevas.add(clave); else nuevas.delete(clave);
    this.lineasSeleccionadas.set(nuevas);
    this.mensajeImpresion.set('');
  }

  public estaImpreso(articulo: ArticuloDetalleVisual): boolean {
    const identidad = this.identidad(articulo);
    return Boolean(identidad && this.lineasImpresas().has(claveArticuloImpreso(identidad)));
  }

  public puedeTransferir(articulo: ArticuloDetalleVisual): boolean {
    const identidad = this.identidad(articulo);
    return this.configuracion.herramientasImpresionPendiente === true && this.permitirTransferencia
      && articulo.operacionPermitida !== false && Boolean(identidad && /^(R1|SAP):.{1,140}$/.test(identidad.idOrigen)
        && /^\d{1,20}$/.test(identidad.identificadorDetalle));
  }

  public seleccionadoTransferencia(articulo: ArticuloDetalleVisual): boolean {
    const identidad = this.identidad(articulo);
    return Boolean(identidad && this.lineasSeleccionadasTransferencia().has(claveArticuloImpreso(identidad)));
  }

  public alternarTransferencia(articulo: ArticuloDetalleVisual, seleccionado: boolean): void {
    if (this.bloqueoHerramientas() || !this.puedeTransferir(articulo) || !this.articulosVisibles().includes(articulo)) return;
    const seleccion = new Set(this.lineasSeleccionadasTransferencia());
    const clave = claveArticuloImpreso(this.identidad(articulo)!);
    if (seleccionado) seleccion.add(clave); else seleccion.delete(clave);
    this.lineasSeleccionadasTransferencia.set(seleccion);
  }

  public transferir(): void {
    if (this.bloqueoHerramientas()) return;
    const lineas = this.articulosVisibles().filter(a => this.puedeTransferir(a) && this.seleccionadoTransferencia(a)).map(a => this.identidad(a)!);
    if (lineas.length > 0) this.transferirSeleccionados.emit(lineas);
  }

  public todasTransferenciasSeleccionadas(): boolean {
    const disponibles = this.articulosVisibles().filter(a => this.puedeTransferir(a));
    return disponibles.length > 0 && disponibles.every(a => this.seleccionadoTransferencia(a));
  }

  public seleccionarTodasTransferencias(): void {
    if (this.bloqueoHerramientas()) return;
    const seleccionar = !this.todasTransferenciasSeleccionadas();
    this.articulosVisibles().filter(a => this.puedeTransferir(a)).forEach(a => this.alternarTransferencia(a, seleccionar));
  }

  public imprimirSeleccionados(): void {
    if (!this.pedido || this.guardandoImpresion() || this.preparandoImpresion() || this.loteImpresion || this.lineasSeleccionadas().size === 0) return;
    if (this.configuracion.herramientasImpresionPendiente) {
      if (!this.bloqueoHerramientas()) this.validarResponsablesImpresion();
      return;
    }
    this.abrirImpresion(this.articulosElegidos());
  }

  private articulosElegidos(): ArticuloDetalleVisual[] {
    const seleccionadas = this.lineasSeleccionadas();
    return this.articulosVisibles().flatMap((articulo) => {
      const identidad = this.identidad(articulo);
      return identidad && this.puedeImprimir(articulo) && seleccionadas.has(claveArticuloImpreso(identidad))
        ? [articulo]
        : [];
    });
  }

  private abrirImpresion(elegidos: ArticuloDetalleVisual[]): void {
    if (elegidos.length === 0) return;
    this.loteImpresion = elegidos.map((articulo) => ({
      ...this.identidad(articulo)!, codigoArticulo: articulo.codigo?.trim() || null,
    }));
    this.errorRegistroImpresion.set('');

    this.articulosImpresion.set(elegidos.map((articulo) => ({
      codigo: articulo.codigo?.trim() || '—',
      descripcion: articulo.descripcion?.trim() || '—',
      cantidad: articulo.cantidad,
      bodega: articulo.codigoAlmacen?.trim() || '—',
    })));
    this.fechaHoraImpresion.set(formatearFechaHoraHonduras(new Date(), true));
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

  public cancelarAsignacionImpresion(forzar = false): void {
    if (this.asignandoResponsables() && !forzar) return;
    ++this.versionAsignacion;
    this.solicitarResponsable.set(false);
    this.consultandoResponsables.set(false);
    this.asignandoResponsables.set(false);
    this.articulosSinResponsable.set([]);
    this.errorAsignacionImpresion.set('');
  }

  private validarResponsablesImpresion(): void {
    const elegidos = this.articulosElegidos();
    if (elegidos.length === 0) return;
    const version = ++this.versionAsignacion;
    this.firmaAsignacion = this.firmaSeleccion();
    this.consultandoResponsables.set(true);
    this.mensajeImpresion.set('');
    const servicio = this.inyector.get(AsignacionesService);
    servicio.consultar(elegidos.map(a => this.identidad(a)!)).pipe(takeUntilDestroyed(this.destruirRef)).subscribe({
      next: ({ datos }) => {
        if (!this.flujoAsignacionVigente(version)) return;
        const actuales = new Map(datos.map(a => [claveArticuloAsignado(a), a]));
        if (elegidos.some(a => !actuales.has(claveArticuloAsignado(this.identidad(a)!)))) {
          this.consultandoResponsables.set(false);
          this.mensajeImpresion.set('No se pudo comprobar el responsable de todos los artículos. Intentá de nuevo.');
          return;
        }
        this.asignacionesActualizadas.emit(datos);
        const faltantes = elegidos.filter(a => !actuales.get(claveArticuloAsignado(this.identidad(a)!))?.usuarioAsignado);
        if (faltantes.length === 0) {
          this.consultandoResponsables.set(false);
          if (datos.every(a => this.puedeImprimirAsignacion(a))) this.abrirImpresion(elegidos);
          else this.mensajeImpresion.set('Algunos artículos tienen otro responsable. Revisá la selección.');
          return;
        }
        this.articulosSinResponsable.set(faltantes);
        servicio.obtenerUsuarios().pipe(takeUntilDestroyed(this.destruirRef)).subscribe({
          next: ({ datos: usuarios, puedeAsignar }) => {
            if (!this.flujoAsignacionVigente(version)) return;
            this.consultandoResponsables.set(false);
            this.usuariosAsignablesImpresion.set(puedeAsignar ? usuarios : []);
            this.errorAsignacionImpresion.set(puedeAsignar && usuarios.length > 0 ? '' : 'Tu usuario no puede asignar estos artículos. Solicitá la asignación al responsable de bodega.');
            this.solicitarResponsable.set(true);
          },
          error: () => {
            if (!this.flujoAsignacionVigente(version)) return;
            this.consultandoResponsables.set(false);
            this.mensajeImpresion.set('No se pudo cargar la lista de responsables. Intentá de nuevo.');
          },
        });
      },
      error: () => {
        if (!this.flujoAsignacionVigente(version)) return;
        this.consultandoResponsables.set(false);
        this.mensajeImpresion.set('No se pudo comprobar la asignación. Intentá de nuevo.');
      },
    });
  }

  public asignarYContinuarImpresion(usuario: string): void {
    if (!this.solicitarResponsable() || this.asignandoResponsables()
      || !this.usuariosAsignablesImpresion().some(a => a.usuario === usuario)) return;
    const version = this.versionAsignacion;
    if (!this.flujoAsignacionVigente(version)) return;
    const servicio = this.inyector.get(AsignacionesService);
    const lineas = this.articulosElegidos().map(a => this.identidad(a)!);
    this.asignandoResponsables.set(true);
    this.errorAsignacionImpresion.set('');
    // Consultar de nuevo: otra sesión puede haber asignado mientras el modal estaba abierto.
    servicio.consultar(lineas).pipe(
      concatMap(({ datos }) => {
        if (!this.flujoAsignacionVigente(version) || lineas.some(l => !datos.some(a => claveArticuloAsignado(a) === claveArticuloAsignado(l)))) {
          return throwError(() => new Error('La selección cambió.'));
        }
        return from(datos).pipe(concatMap(actual => {
          if (!this.flujoAsignacionVigente(version)) return throwError(() => new Error('La selección cambió.'));
          return actual.usuarioAsignado ? of({ datos: actual }) : servicio.guardar({ idOrigen: actual.idOrigen, identificadorDetalle: actual.identificadorDetalle }, usuario).pipe(
            catchError(error => error.status === 409 && error.error?.datos?.usuarioAsignado
              ? of({ datos: error.error.datos as AsignacionArticulo }) : throwError(() => error)),
          );
        }));
      }),
      tap(({ datos }) => { if (version === this.versionAsignacion) this.asignacionesActualizadas.emit([datos]); }),
      toArray(), takeUntilDestroyed(this.destruirRef),
    ).subscribe({
      next: resultados => {
        if (!this.flujoAsignacionVigente(version)) return;
        this.asignandoResponsables.set(false);
        this.solicitarResponsable.set(false);
        if (resultados.length === lineas.length && resultados.every(({ datos }) => datos.usuarioAsignado && this.puedeImprimirAsignacion(datos))) {
          this.abrirImpresion(this.articulosElegidos());
        } else this.mensajeImpresion.set('Algunos artículos tienen otro responsable. Revisá la selección.');
      },
      error: () => {
        if (version !== this.versionAsignacion) return;
        this.asignandoResponsables.set(false);
        this.errorAsignacionImpresion.set('No se pudo completar la asignación. Las asignaciones guardadas se conservan; podés reintentar.');
      },
    });
  }

  private puedeImprimirAsignacion(asignacion: AsignacionArticulo): boolean {
    const sesion = this.inyector.get(AutenticacionService).usuario();
    return sesion?.codigoRol === 'ADMINISTRADOR' || sesion?.nombreUsuario.trim().toLowerCase() === 'gcruz'
      || sesion?.nombreUsuario.trim().toLowerCase() === asignacion.usuarioAsignado?.trim().toLowerCase();
  }

  private flujoAsignacionVigente(version: number): boolean {
    if (version !== this.versionAsignacion) return false;
    if (this.firmaAsignacion === this.firmaSeleccion()) return true;
    this.cancelarAsignacionImpresion(true);
    this.mensajeImpresion.set('Los artículos cambiaron. Revisá la selección antes de imprimir.');
    return false;
  }

  private firmaSeleccion(): string {
    return JSON.stringify([this.pedido?.idOrigen, this.articulosElegidos().map(a => [a.identificadorDetalle, a.codigo, a.cantidad, a.codigoAlmacen])]);
  }

  private bodegaArticulo(articulo: ArticuloDetalleVisual): string { return articulo.codigoAlmacen?.trim() || 'Sin bodega'; }

  private conciliarSeleccionVisible(): void {
    if (!this.configuracion.herramientasImpresionPendiente) return;
    const disponibles = new Set(this.articulosVisibles().filter(a => this.puedeImprimir(a)).map(a => claveArticuloImpreso(this.identidad(a)!)));
    this.lineasSeleccionadas.set(new Set([...this.lineasSeleccionadas()].filter(clave => disponibles.has(clave))));
    const transferibles = new Set(this.articulosVisibles().filter(a => this.puedeTransferir(a)).map(a => claveArticuloImpreso(this.identidad(a)!)));
    this.lineasSeleccionadasTransferencia.set(new Set([...this.lineasSeleccionadasTransferencia()].filter(clave => transferibles.has(clave))));
  }

  @HostListener('window:afterprint')
  public alCerrarImpresion(): void {
    // Este evento indica que el diálogo terminó, no que hubo una impresión.
    if (!this.esperandoCierreImpresion || !this.loteImpresion) return;
    this.esperandoCierreImpresion = false;
    this.preparandoImpresion.set(false);
    this.confirmarImpresion.set(true);
  }

  public descartarRegistroImpresion(forzar = false): void {
    if (this.guardandoImpresion() && !forzar) return;
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
    // Descartar consultas iniciadas antes de este registro para evitar retroceder el estado.
    ++this.versionConsultaImpresion;
    this.impresionesService.registrar(lote)
      .pipe(takeUntilDestroyed(this.destruirRef))
      .subscribe({
        next: ({ datos }) => {
          ++this.versionConsultaImpresion;
          if (this.pedido?.idOrigen === lote[0]?.idOrigen) {
            const estados = new Map(this.estadosImpresion());
            datos.forEach((dato) => estados.set(claveArticuloImpreso(dato), dato));
            this.estadosImpresion.set(estados);
            this.lineasImpresas.set(new Set(estados.keys()));
            const seleccion = new Set(this.lineasSeleccionadas());
            lote.forEach((linea) => seleccion.delete(claveArticuloImpreso(linea)));
            this.lineasSeleccionadas.set(seleccion);
          }
          this.guardandoImpresion.set(false);
          this.descartarRegistroImpresion();
        },
        error: () => {
          this.guardandoImpresion.set(false);
          this.errorRegistroImpresion.set('No se pudo guardar el registro de impresión. Intentá de nuevo.');
        },
      });
  }

  public informacionImpresion(articulo: ArticuloDetalleVisual): string {
    const identidad = this.identidad(articulo);
    const estado = identidad && this.estadosImpresion().get(claveArticuloImpreso(identidad));
    if (!estado) return 'Este artículo ya fue impreso';
    const responsable = estado.ultimaImpresionPor ? ` · Por: ${estado.ultimaImpresionPor}` : '';
    return `Última impresión: ${this.fecha(estado.ultimaImpresionEn)}${responsable} · Impresiones: ${estado.cantidadImpresiones}`;
  }

  private cargarEstadoImpresion(conservar = false): void {
    const version = ++this.versionConsultaImpresion;
    if (!conservar) {
      this.lineasSeleccionadas.set(new Set());
      this.lineasImpresas.set(new Set());
      this.estadosImpresion.set(new Map());
    }
    this.mensajeImpresion.set('');
    const pedido = this.pedido;
    if (!pedido) return;
    const idOrigenConsultado = pedido.idOrigen;
    const lineas = pedido.articulos.flatMap((articulo) => {
      const identidad = this.identidad(articulo);
      return identidad ? [identidad] : [];
    });
    if (lineas.length === 0) return;

    this.impresionesService.consultar(lineas)
      .pipe(takeUntilDestroyed(this.destruirRef))
      .subscribe({
        next: ({ datos }) => {
          if (this.pedido?.idOrigen !== idOrigenConsultado || version !== this.versionConsultaImpresion || this.guardandoImpresion()) return;
          this.estadosImpresion.set(new Map(datos.map((dato) => [claveArticuloImpreso(dato), dato])));
          this.lineasImpresas.set(new Set(datos.map(claveArticuloImpreso)));
        },
        error: () => undefined,
      });
  }

  private identidad(articulo: ArticuloDetalleVisual): IdentidadArticuloImpresion | null {
    const idOrigen = this.pedido?.idOrigen?.trim();
    const identificadorDetalle = articulo.identificadorDetalle?.trim();
    return idOrigen && identificadorDetalle ? { idOrigen, identificadorDetalle } : null;
  }

  private tieneValor(valor: string | null | undefined): boolean {
    return Boolean(valor?.trim());
  }
}
