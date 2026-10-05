import { Component, DestroyRef, HostListener, Injector, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { SelectorAlmacenesDirective } from '../../compartido/interaccion/selector-almacenes.directive';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { forkJoin, type Observable, type Subscription } from 'rxjs';
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
import { duracionHistorialMs, formatearDuracionPedido } from '../../compartido/tiempo-pedido';
import { AccionSeleccionDetalleComponent } from '../../compartido/detalle-pedido/controles-seleccion-detalle.component';
import { VistaImpresionPedidoComponent, type ArticuloImpresionPedido } from '../pedidos/vista-impresion-pedido.component';
import { ConfirmacionImpresionComponent } from '../../compartido/impresiones/confirmacion-impresion.component';
import { ImpresionesService } from '../../compartido/impresiones/impresiones.service';
import type { LineaRegistroImpresion } from '../../compartido/impresiones/impresion.interface';
import { ImpresionPedidoPosService } from '../pedidos/impresion-pedido-pos.service';
import { AutenticacionService } from '../autenticacion/autenticacion.service';
import { obtenerPermisosRol } from '../autenticacion/permisos-rol';

const claveFiltrosHistorial = 'historial';
const intervaloActualizacionHistorialMs = 15000;

interface FiltrosHistorialGuardados {
  fechaDesde?: string;
  fechaHasta?: string;
  numeroPedido?: string;
  vista?: VistaHistorial;
  pagina?: number;
  paginaEspeciales?: number;
  cantidadPorPagina?: number;
}
type VistaHistorial = 'pedido' | 'articulos';

@Component({
  selector: 'app-historial',
  imports: [FormsModule, RouterLink, DetallePedidoVistaComponent,
    CodigoArticuloInventarioDirective, PaginacionComponent, SelectorAlmacenesDirective,
    AccionSeleccionDetalleComponent, VistaImpresionPedidoComponent, ConfirmacionImpresionComponent],
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
  private readonly inyector = inject(Injector);
  private readonly impresionPedidoPos = inject(ImpresionPedidoPosService);
  private readonly autenticacion = inject(AutenticacionService);
  private temporizador?: ReturnType<typeof setInterval>;
  private temporizadorImpresion?: ReturnType<typeof setTimeout>;
  private consultaListado?: Subscription;
  private secuenciaConsulta = 0;
  private loteImpresion: LineaRegistroImpresion[] | null = null;
  private esperandoCierreImpresion = false;
  private haCargado = false;
  public readonly idOrigen = signal<string | null>(null);
  public filtros = {
    fechaDesde: obtenerFechaLocalActual(),
    fechaHasta: obtenerFechaLocalActual(), numeroPedido: '', codigosAlmacen: [] as string[], cantidadPorPagina: 25,
  };
  private filtrosAplicados = { ...this.filtros, codigosAlmacen: [...this.filtros.codigosAlmacen] };
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
    { clave: 'especiales' as const, titulo: 'Pedidos Especiales', pagina: this.paginaEspeciales(),
      totalRegistros: this.totalRegistrosEspeciales(), pedidos: this.registrosEspeciales(),
      articulos: this.articulosEspeciales() },
    { clave: 'normales' as const, titulo: 'Pedidos Normales', pagina: this.pagina(),
      totalRegistros: this.totalRegistros(), pedidos: this.registros(), articulos: this.articulos() },
  ]);
  public readonly cargando = signal(false);
  public readonly actualizando = signal(false);
  public readonly error = signal<MensajeError | null>(null);
  public readonly lineasSeleccionadasImpresion = signal<ReadonlySet<string>>(new Set());
  public readonly articulosImpresion = signal<readonly ArticuloImpresionPedido[]>([]);
  public readonly fechaHoraImpresion = signal('');
  public readonly preparandoImpresion = signal(false);
  public readonly confirmarImpresion = signal(false);
  public readonly guardandoImpresion = signal(false);
  public readonly errorRegistroImpresion = signal('');
  private readonly configuracionDetalleBase: ConfiguracionDetallePedido = {
    contexto: 'Historial',
    titulo: 'Detalle del pedido',
    descripcion: 'Revisá los artículos y los datos de entrega.',
    etiquetaEstado: 'Facturado',
    severidadEstado: 'exito',
    etiquetaRetorno: 'Regresar al historial',
    tituloInformacion: 'Datos de entrega',
    etiquetaArticulos: 'Artículos entregados',
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
      datosOperativos: pedido.estadoHistorial === 'CERRADO' || pedido.estadoHistorial === 'CANCELADO' ? [
        { etiqueta: 'Estado', valor: pedido.estadoHistorial, icono: 'pi pi-info-circle' },
        { etiqueta: 'Bodega', valor: pedido.codigosAlmacen.join(', ') || null, icono: 'pi pi-map-marker' },
      ] : pedido.entregaSap ? [
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
        { etiqueta: 'Tiempo total', valor: this.tiempoTotalHistorial(pedido), icono: 'pi pi-stopwatch' },
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
    const configuracion = { ...this.configuracionDetalleBase, permitirImpresion: !this.modoSoloConsulta() };
    if (pedido?.estadoHistorial === 'CERRADO' || pedido?.estadoHistorial === 'CANCELADO') return { ...configuracion,
      titulo: pedido.estadoHistorial === 'CANCELADO' ? 'Detalle del pedido cancelado' : 'Detalle del pedido cerrado',
      descripcion: pedido.estadoHistorial === 'CANCELADO'
        ? 'Pedido cancelado en SAP' : 'Pedido cerrado sin entrega ni factura en SAP',
      etiquetaEstado: pedido.estadoHistorial,
      severidadEstado: pedido.estadoHistorial === 'CERRADO' ? 'peligro' : 'informacion',
      tituloInformacion: 'Datos del pedido', etiquetaArticulos: 'Artículos del pedido' };
    return pedido?.entregaSap ? { ...configuracion, titulo: 'Detalle de la entrega SAP',
      etiquetaEstado: pedido.estadoHistorial || 'Entregado, Sin factura',
      severidadEstado: pedido.estadoHistorial === 'Facturado' ? 'exito' : 'informacion' }
      : configuracion;
  });
  public modoSoloConsulta(): boolean {
    return obtenerPermisosRol(this.autenticacion.usuario()?.codigoRol).soloConsultaOperativa;
  }

  public numeroDocumento(pedido: HistorialValidado | ArticuloHistorial): string {
    return pedido.entregaSap ? `Entrega SAP ${pedido.entregaSap.docNum}` : pedido.numeroPedido;
  }
  private numerosBase(pedido: HistorialValidado, tipo: number): string {
    return [...new Set(pedido.entregaSap?.bases.filter(b => b.baseType === tipo)
      .flatMap(b => b.numeroDocumento ? [b.numeroDocumento] : []) ?? [])].join(', ');
  }

  public ngOnInit(): void {
    this.destruirRef.onDestroy(() => {
      clearTimeout(this.temporizadorImpresion);
      this.consultaListado?.unsubscribe();
      this.impresionPedidoPos.finalizar();
    });
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
    this.limpiarSeleccionImpresion();
    this.pagina.set(1);
    this.paginaEspeciales.set(1);
    this.confirmarFiltrosAplicados();
    this.guardarFiltros();
    this.actualizarUrl();
    this.cargar();
  }
  public cambiarCantidadPorPagina(): void {
    this.limpiarSeleccionImpresion();
    this.pagina.set(1);
    this.paginaEspeciales.set(1);
    this.confirmarFiltrosAplicados();
    this.guardarFiltros();
    this.actualizarUrl();
    this.cargar();
  }
  public cambiarVista(vista: VistaHistorial): void {
    if (this.vista() === vista) return;
    this.limpiarSeleccionImpresion();
    this.confirmarFiltrosAplicados();
    this.vista.set(vista); this.pagina.set(1); this.paginaEspeciales.set(1);
    this.haCargado = false; this.hayMas.set(false);
    if (vista === 'articulos') { this.articulos.set([]); this.articulosEspeciales.set([]); }
    else { this.registros.set([]); this.registrosEspeciales.set([]); }
    this.guardarFiltros(); this.actualizarUrl(); this.cargar();
  }
  public limpiarFiltros(): void {
    this.limpiarSeleccionImpresion();
    this.filtros = { fechaDesde: obtenerFechaLocalActual(), fechaHasta: obtenerFechaLocalActual(),
      numeroPedido: '', codigosAlmacen: [], cantidadPorPagina: 25 };
    this.pagina.set(1); this.paginaEspeciales.set(1);
    this.confirmarFiltrosAplicados();
    this.guardarFiltros(); this.actualizarUrl(); this.cargar();
  }
  public estaSeleccionado(codigoAlmacen: string): boolean {
    return this.filtros.codigosAlmacen.includes(codigoAlmacen);
  }
  public alternarAlmacen(codigoAlmacen: string, seleccionado: boolean): void {
    this.filtros.codigosAlmacen = seleccionado
      ? [...new Set([...this.filtros.codigosAlmacen, codigoAlmacen])]
      : this.filtros.codigosAlmacen.filter((codigo) => codigo !== codigoAlmacen);
    this.filtrosGlobales.actualizar({ codigosAlmacen: this.filtros.codigosAlmacen });
  }
  public quitarAlmacen(codigoAlmacen: string): void {
    this.alternarAlmacen(codigoAlmacen, false);
  }
  public limpiarAlmacenes(): void {
    this.filtros.codigosAlmacen = [];
    this.filtrosGlobales.actualizar({ codigosAlmacen: [] });
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

  public estaSeleccionadoParaImpresion(articulo: ArticuloHistorial): boolean {
    return this.lineasSeleccionadasImpresion().has(this.claveImpresion(articulo));
  }

  public alternarSeleccionImpresion(articulo: ArticuloHistorial, seleccionado: boolean): void {
    if (!articulo.identificadorDetalle?.trim() || this.preparandoImpresion()
      || this.confirmarImpresion() || this.guardandoImpresion()) return;
    const seleccion = new Set(this.lineasSeleccionadasImpresion());
    const clave = this.claveImpresion(articulo);
    if (seleccionado) seleccion.add(clave); else seleccion.delete(clave);
    this.lineasSeleccionadasImpresion.set(seleccion);
  }

  public todasImpresionesSeleccionadas(grupo: 'normales' | 'especiales'): boolean {
    const disponibles = this.articulosGrupo(grupo).filter((articulo) => articulo.identificadorDetalle?.trim());
    return disponibles.length > 0
      && disponibles.every((articulo) => this.estaSeleccionadoParaImpresion(articulo));
  }

  public seleccionarTodasImpresiones(grupo: 'normales' | 'especiales'): void {
    if (this.preparandoImpresion() || this.confirmarImpresion() || this.guardandoImpresion()) return;
    const disponibles = this.articulosGrupo(grupo).filter((articulo) => articulo.identificadorDetalle?.trim());
    const seleccionar = !this.todasImpresionesSeleccionadas(grupo);
    const seleccion = new Set(this.lineasSeleccionadasImpresion());
    disponibles.forEach((articulo) => seleccionar
      ? seleccion.add(this.claveImpresion(articulo))
      : seleccion.delete(this.claveImpresion(articulo)));
    this.lineasSeleccionadasImpresion.set(seleccion);
  }

  public pedidoSeleccionadoParaImpresion(pedido: HistorialValidado): boolean {
    const disponibles = this.articulosPedido(pedido).filter((articulo) => articulo.identificadorDetalle?.trim());
    return disponibles.length > 0
      && disponibles.every((articulo) => this.estaSeleccionadoParaImpresion(articulo));
  }

  public alternarPedidoImpresion(pedido: HistorialValidado, seleccionado: boolean): void {
    if (this.preparandoImpresion() || this.confirmarImpresion() || this.guardandoImpresion()) return;
    const seleccion = new Set(this.lineasSeleccionadasImpresion());
    this.articulosPedido(pedido).filter((articulo) => articulo.identificadorDetalle?.trim())
      .forEach((articulo) => seleccionado
        ? seleccion.add(this.claveImpresion(articulo))
        : seleccion.delete(this.claveImpresion(articulo)));
    this.lineasSeleccionadasImpresion.set(seleccion);
  }

  public cantidadSeleccionadaImpresion(grupo: 'normales' | 'especiales'): number {
    const seleccionadas = this.lineasSeleccionadasImpresion();
    return this.articulosGrupo(grupo).filter((articulo) => articulo.identificadorDetalle?.trim()
      && seleccionadas.has(this.claveImpresion(articulo))).length;
  }

  public imprimirSeleccionados(grupo: 'normales' | 'especiales' | null = null): void {
    if (this.modoSoloConsulta() || this.preparandoImpresion()
      || this.confirmarImpresion() || this.guardandoImpresion()) return;
    const visibles = grupo ? this.articulosGrupo(grupo)
      : [...this.articulosGrupo('normales'), ...this.articulosGrupo('especiales')];
    const elegidos = visibles
      .filter((articulo) => articulo.identificadorDetalle?.trim()
        && this.lineasSeleccionadasImpresion().has(this.claveImpresion(articulo)));
    if (elegidos.length === 0) return;
    this.loteImpresion = elegidos.map((articulo) => ({
      idOrigen: articulo.idOrigen,
      identificadorDetalle: articulo.identificadorDetalle!.trim(),
      codigoArticulo: articulo.codigoArticulo?.trim() || null,
    }));
    this.articulosImpresion.set(this.impresionPedidoPos.preparar(elegidos.map((articulo) => ({
      idPedido: articulo.idOrigen,
      numeroPedido: articulo.numeroPedido,
      codigo: articulo.codigoArticulo?.trim() || '—',
      descripcion: articulo.descripcion?.trim() || '—',
      cantidad: articulo.cantidad,
      bodega: articulo.codigoAlmacen?.trim() || '—',
      vendedor: articulo.nombreVendedor?.trim() || 'Sin vendedor',
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

  private articulosGrupo(grupo: 'normales' | 'especiales'): ArticuloHistorial[] {
    if (this.vista() === 'articulos') {
      return grupo === 'normales' ? this.articulos() : this.articulosEspeciales();
    }
    const pedidos = grupo === 'normales' ? this.registros() : this.registrosEspeciales();
    return pedidos.flatMap((pedido) => this.articulosPedido(pedido));
  }

  private articulosPedido(pedido: HistorialValidado): ArticuloHistorial[] {
    return pedido.articulos.map((articulo) => ({
      estadoHistorial: pedido.estadoHistorial,
      entregaSap: pedido.entregaSap,
      idOrigen: pedido.idOrigen,
      identificadorDetalle: articulo.identificadorDetalle ?? null,
      numeroPedido: pedido.numeroPedido,
      codigoArticulo: articulo.codigoArticulo,
      descripcion: articulo.descripcion,
      cantidad: articulo.cantidad,
      codigoAlmacen: articulo.codigoAlmacen,
      nombreAlmacen: articulo.nombreAlmacen,
      fechaHoraPedido: pedido.fechaHoraPedido,
      despachadoEn: articulo.transferidoEn ?? pedido.despachadoEn,
      nombreVendedor: pedido.nombreVendedor,
      usuarioAsignado: articulo.usuarioAsignado ?? null,
      esEspecial: pedido.esEspecial,
      modificado: pedido.modificado,
      modificadoPor: pedido.modificadoPor,
    }));
  }

  private claveImpresion(articulo: ArticuloHistorial): string {
    return `${articulo.idOrigen}\u0000${articulo.identificadorDetalle?.trim() ?? ''}`;
  }

  private limpiarSeleccionImpresion(): void {
    this.lineasSeleccionadasImpresion.set(new Set());
  }

  private reconciliarSeleccionImpresion(): void {
    const visibles = new Set([...this.articulosGrupo('normales'), ...this.articulosGrupo('especiales')]
      .filter((articulo) => articulo.identificadorDetalle?.trim())
      .map((articulo) => this.claveImpresion(articulo)));
    this.lineasSeleccionadasImpresion.set(new Set(
      [...this.lineasSeleccionadasImpresion()].filter((clave) => visibles.has(clave)),
    ));
  }

  public marcador(valor: string | null): string { return valor?.trim() || '—'; }
  public responsablesPedido(pedido: HistorialValidado): string {
    const responsables = pedido.responsablesAsignados ?? [...new Set(pedido.articulos
      .flatMap(({ usuarioAsignado }) => usuarioAsignado ? [usuarioAsignado] : []))];
    return responsables.length > 0 ? responsables.join(', ') : '—';
  }
  public irPagina(grupo: 'normales' | 'especiales', pagina: number): void {
    if (this.cargando()) return;
    this.limpiarSeleccionImpresion();
    this.confirmarFiltrosAplicados();
    if (grupo === 'normales') this.pagina.set(pagina); else this.paginaEspeciales.set(pagina);
    this.guardarFiltros(); this.actualizarUrl(); this.cargar();
  }
  public modificadoPor(pedido: { modificado?: boolean; modificadoPor?: string | null }): string {
    return pedido.modificado ? pedido.modificadoPor?.trim() || 'No disponible' : '—';
  }
  public fechaHora(valor: string | null, hora12 = false): string {
    return valor ? formatearFechaHoraHonduras(valor, hora12) : '—';
  }
  public tiempoTotalHistorial(
    pedido: HistorialValidado | ArticuloHistorial,
  ): string {
    return formatearDuracionPedido(duracionHistorialMs(pedido));
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
    const fechaActual = obtenerFechaLocalActual();
    const fechaDesdeUrl = parametros.get('fechaDesde');
    const fechaHastaUrl = parametros.get('fechaHasta');
    this.filtros.fechaDesde = esFechaCalendarioValida(fechaDesdeUrl) ? fechaDesdeUrl : fechaActual;
    this.filtros.fechaHasta = esFechaCalendarioValida(fechaHastaUrl) ? fechaHastaUrl : fechaActual;
    this.filtros.numeroPedido = parametros.get('numeroPedido') || '';
    const codigosUrl = parametros.getAll('codigoAlmacen')
      .map((codigo) => codigo.trim()).filter(Boolean);
    this.filtros.codigosAlmacen = codigosUrl.length > 0
      ? [...new Set(codigosUrl)] : globales.codigosAlmacen;
    const cantidad = Number(parametros.get('cantidadPorPagina') ?? guardados.cantidadPorPagina);
    if ([25, 50, 100].includes(cantidad)) this.filtros.cantidadPorPagina = cantidad;
    this.pagina.set(Math.max(1, Number(parametros.get('pagina')) || 1));
    this.paginaEspeciales.set(Math.max(1, Number(parametros.get('paginaEspeciales')) || 1));
    const vista = parametros.get('vista') ?? guardados.vista;
    this.vista.set(vista === 'pedido' ? 'pedido' : 'articulos');
    this.confirmarFiltrosAplicados();
    this.guardarFiltros();
    this.actualizarUrl();
  }

  private parametrosActuales(): URLSearchParams {
    const parametros = new URLSearchParams({ fechaDesde: this.filtrosAplicados.fechaDesde,
      fechaHasta: this.filtrosAplicados.fechaHasta, pagina: String(this.pagina()),
      paginaEspeciales: String(this.paginaEspeciales()),
      cantidadPorPagina: String(this.filtrosAplicados.cantidadPorPagina) });
    if (this.filtrosAplicados.numeroPedido.trim()) {
      parametros.set('numeroPedido', this.filtrosAplicados.numeroPedido.trim());
    }
    for (const codigoAlmacen of this.filtrosAplicados.codigosAlmacen) {
      parametros.append('codigoAlmacen', codigoAlmacen);
    }
    parametros.set('vista', this.vista());
    return parametros;
  }

  private actualizarUrl(): void {
    const queryParams: Record<string, string | string[]> = {
      fechaDesde: this.filtrosAplicados.fechaDesde,
      fechaHasta: this.filtrosAplicados.fechaHasta,
      pagina: String(this.pagina()),
      paginaEspeciales: String(this.paginaEspeciales()),
      cantidadPorPagina: String(this.filtrosAplicados.cantidadPorPagina),
      codigoAlmacen: [...this.filtrosAplicados.codigosAlmacen],
      vista: this.vista(),
    };
    if (this.filtrosAplicados.numeroPedido.trim()) {
      queryParams['numeroPedido'] = this.filtrosAplicados.numeroPedido.trim();
    }
    void this.enrutador.navigate([], { relativeTo: this.ruta, queryParams, replaceUrl: true });
  }

  private cargar(esAutomatica = false): void {
    if (esAutomatica && (this.cargando() || this.actualizando())) return;
    if (!esAutomatica) {
      this.consultaListado?.unsubscribe();
      this.actualizando.set(false);
      this.cargando.set(true);
      this.haCargado = false;
      this.error.set(null);
      this.vaciarVistaActual();
    } else if (this.haCargado) {
      this.actualizando.set(true);
    } else {
      this.cargando.set(true);
    }
    const secuencia = ++this.secuenciaConsulta;
    const vistaConsulta = this.vista();
    const filtrosConsulta = { ...this.filtrosAplicados,
      codigosAlmacen: [...this.filtrosAplicados.codigosAlmacen] };
    const consultar = (clasificacion: 'normal' | 'especial', pagina: number):
    Observable<RespuestaHistorial | RespuestaArticulosHistorial> => vistaConsulta === 'articulos'
      ? this.servicio.buscarArticulos({ ...filtrosConsulta, pagina, clasificacion })
      : this.servicio.buscar({ ...filtrosConsulta, pagina, clasificacion });
    this.consultaListado = forkJoin({
      normales: consultar('normal', this.pagina()),
      especiales: consultar('especial', this.paginaEspeciales()),
    })
      .pipe(takeUntilDestroyed(this.destruirRef)).subscribe({
        next: ({ normales, especiales }) => {
          if (secuencia !== this.secuenciaConsulta) return;
          if (vistaConsulta === 'articulos') {
            this.articulos.set(normales.datos as ArticuloHistorial[]);
            this.articulosEspeciales.set(especiales.datos as ArticuloHistorial[]);
            this.reconciliarSeleccionImpresion();
          } else {
            this.registros.set(normales.datos as HistorialValidado[]);
            this.registrosEspeciales.set(especiales.datos as HistorialValidado[]);
          }
          if (this.vista() === vistaConsulta) {
            this.hayMas.set(normales.paginacion.hayMas);
            this.totalRegistros.set(
              normales.paginacion.totalRegistros ?? normales.datos.length,
            );
            this.totalRegistrosEspeciales.set(
              especiales.paginacion.totalRegistros ?? especiales.datos.length,
            );
            this.haCargado = true;
          } else {
            this.hayMas.set(false); this.haCargado = false;
          }
          this.finalizarConsulta(vistaConsulta, secuencia);
        },
        error: (error: unknown) => {
          if (secuencia !== this.secuenciaConsulta) return;
          if (!esAutomatica) this.error.set(obtenerMensajeError(error, 'historial'));
          this.finalizarConsulta(vistaConsulta, secuencia);
        },
      });
  }

  private finalizarConsulta(vistaConsulta: VistaHistorial, secuencia: number): void {
    if (secuencia !== this.secuenciaConsulta) return;
    this.cargando.set(false);
    this.actualizando.set(false);
    if (this.vista() !== vistaConsulta) queueMicrotask(() => this.cargar());
  }

  private vaciarVistaActual(): void {
    if (this.vista() === 'articulos') {
      this.articulos.set([]);
      this.articulosEspeciales.set([]);
    } else {
      this.registros.set([]);
      this.registrosEspeciales.set([]);
    }
    this.totalRegistros.set(0);
    this.totalRegistrosEspeciales.set(0);
  }

  private confirmarFiltrosAplicados(): void {
    this.filtrosAplicados = { ...this.filtros,
      codigosAlmacen: [...this.filtros.codigosAlmacen] };
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
      this.filtrosGlobales.actualizar({ fechaDesde: this.filtrosAplicados.fechaDesde,
        fechaHasta: this.filtrosAplicados.fechaHasta,
        codigosAlmacen: this.filtrosAplicados.codigosAlmacen });
      guardarFiltrosSesion(claveFiltrosHistorial, {
        fechaDesde: this.filtrosAplicados.fechaDesde,
        fechaHasta: this.filtrosAplicados.fechaHasta,
        numeroPedido: this.filtrosAplicados.numeroPedido.trim(),
        vista: this.vista(),
        pagina: this.pagina(),
        paginaEspeciales: this.paginaEspeciales(),
        cantidadPorPagina: this.filtrosAplicados.cantidadPorPagina,
      });
    } catch { /* Los filtros continúan disponibles durante la navegación actual. */ }
  }

  private leerFiltrosGuardados(): FiltrosHistorialGuardados {
    try {
      const valor = leerFiltrosSesion(claveFiltrosHistorial);
      const fechaValida = (fecha: unknown): fecha is string =>
        typeof fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fecha);
      return {
        fechaDesde: fechaValida(valor['fechaDesde']) ? valor['fechaDesde'] : undefined,
        fechaHasta: fechaValida(valor['fechaHasta']) ? valor['fechaHasta'] : undefined,
        numeroPedido: typeof valor['numeroPedido'] === 'string' && /^\d{0,20}$/.test(valor['numeroPedido'])
          ? valor['numeroPedido'] : undefined,
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
