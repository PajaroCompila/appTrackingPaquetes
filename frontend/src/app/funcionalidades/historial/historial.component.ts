import { Component, DestroyRef, HostListener, Injector, OnInit, computed, inject, signal } from '@angular/core';
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
import { duracionPedidoMs, formatearDuracionPedido } from '../../compartido/tiempo-pedido';
import { AccionSeleccionDetalleComponent } from '../../compartido/detalle-pedido/controles-seleccion-detalle.component';
import { VistaImpresionPedidoComponent, type ArticuloImpresionPedido } from '../pedidos/vista-impresion-pedido.component';
import { ConfirmacionImpresionComponent } from '../../compartido/impresiones/confirmacion-impresion.component';
import { ImpresionesService } from '../../compartido/impresiones/impresiones.service';
import type { LineaRegistroImpresion } from '../../compartido/impresiones/impresion.interface';
import { ImpresionPedidoPosService } from '../pedidos/impresion-pedido-pos.service';

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
  private temporizador?: ReturnType<typeof setInterval>;
  private temporizadorImpresion?: ReturnType<typeof setTimeout>;
  private loteImpresion: LineaRegistroImpresion[] | null = null;
  private esperandoCierreImpresion = false;
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
  public readonly lineasSeleccionadasImpresion = signal<ReadonlySet<string>>(new Set());
  public readonly articulosImpresion = signal<readonly ArticuloImpresionPedido[]>([]);
  public readonly fechaHoraImpresion = signal('');
  public readonly preparandoImpresion = signal(false);
  public readonly confirmarImpresion = signal(false);
  public readonly guardandoImpresion = signal(false);
  public readonly errorRegistroImpresion = signal('');
  public readonly configuracionDetalle: ConfiguracionDetallePedido = {
    contexto: 'Historial',
    titulo: 'Detalle del pedido',
    descripcion: 'Revisá los artículos y los datos de entrega.',
    etiquetaEstado: 'Facturado',
    severidadEstado: 'exito',
    etiquetaRetorno: 'Regresar al historial',
    tituloInformacion: 'Datos de entrega',
    etiquetaArticulos: 'Artículos entregados',
    permitirImpresion: true,
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
    this.destruirRef.onDestroy(() => {
      clearTimeout(this.temporizadorImpresion);
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
    this.guardarFiltros();
    this.actualizarUrl();
    this.cargar();
  }
  public cambiarCantidadPorPagina(): void {
    this.limpiarSeleccionImpresion();
    this.pagina.set(1);
    this.paginaEspeciales.set(1);
    this.guardarFiltros();
    this.actualizarUrl();
    this.cargar();
  }
  public cambiarVista(vista: VistaHistorial): void {
    if (this.vista() === vista) return;
    this.limpiarSeleccionImpresion();
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

  public imprimirSeleccionados(): void {
    if (this.preparandoImpresion() || this.confirmarImpresion() || this.guardandoImpresion()) return;
    const elegidos = [...this.articulosGrupo('normales'), ...this.articulosGrupo('especiales')]
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
    fin?: string | null,
  ): string {
    return formatearDuracionPedido(duracionPedidoMs(pedido, fin ?? pedido.despachadoEn));
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
            this.reconciliarSeleccionImpresion();
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
