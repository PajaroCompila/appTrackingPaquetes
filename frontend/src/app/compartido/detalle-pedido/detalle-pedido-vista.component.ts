import {
  Component,
  DestroyRef,
  EventEmitter,
  HostListener,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import type {
  ArticuloDetalleVisual,
  ConfiguracionDetallePedido,
  ErrorDetalleVisual,
  PedidoDetalleVisual,
} from './detalle-pedido-vista.interface';
import { formatearFechaHoraHonduras } from '../fechas/fecha-honduras';
import { CodigoArticuloInventarioDirective } from '../inventario/codigo-articulo-inventario.directive';
import { ImpresionesService } from '../impresiones/impresiones.service';
import {
  claveArticuloImpreso,
  type IdentidadArticuloImpresion,
} from '../impresiones/impresion.interface';
import {
  VistaImpresionPedidoComponent,
  type ArticuloImpresionPedido,
} from '../../funcionalidades/pedidos/vista-impresion-pedido.component';

@Component({
  selector: 'app-detalle-pedido-vista',
  imports: [CodigoArticuloInventarioDirective, VistaImpresionPedidoComponent],
  templateUrl: './detalle-pedido-vista.component.html',
  styleUrl: './detalle-pedido-vista.component.css',
})
export class DetallePedidoVistaComponent implements OnChanges {
  private readonly impresionesService = inject(ImpresionesService);
  private readonly destruirRef = inject(DestroyRef);
  private lineasPendientesRegistro: IdentidadArticuloImpresion[] = [];

  @Input({ required: true }) public configuracion!: ConfiguracionDetallePedido;
  @Input() public pedido: PedidoDetalleVisual | null = null;
  @Input() public cargando = false;
  @Input() public error: ErrorDetalleVisual | null = null;
  @Output() public readonly regresar = new EventEmitter<void>();
  @Output() public readonly reintentar = new EventEmitter<void>();
  public readonly lineasSeleccionadas = signal<ReadonlySet<string>>(new Set());
  public readonly lineasImpresas = signal<ReadonlySet<string>>(new Set());
  public readonly articulosImpresion = signal<readonly ArticuloImpresionPedido[]>([]);
  public readonly fechaHoraImpresion = signal('');
  public readonly preparandoImpresion = signal(false);
  public readonly mensajeImpresion = signal('');

  public ngOnChanges(cambios: SimpleChanges): void {
    if (cambios['pedido']) this.cargarEstadoImpresion();
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

  public puedeImprimir(articulo: ArticuloDetalleVisual): boolean {
    return Boolean(this.identidad(articulo));
  }

  public estaSeleccionado(articulo: ArticuloDetalleVisual): boolean {
    const identidad = this.identidad(articulo);
    return Boolean(identidad && this.lineasSeleccionadas().has(claveArticuloImpreso(identidad)));
  }

  public alternarSeleccion(articulo: ArticuloDetalleVisual, seleccionado: boolean): void {
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

  public imprimirSeleccionados(): void {
    if (!this.pedido || this.preparandoImpresion() || this.lineasSeleccionadas().size === 0) return;
    const seleccionadas = this.lineasSeleccionadas();
    const elegidos = this.pedido.articulos.flatMap((articulo) => {
      const identidad = this.identidad(articulo);
      return identidad && seleccionadas.has(claveArticuloImpreso(identidad))
        ? [{ articulo, identidad }]
        : [];
    });
    if (elegidos.length === 0) return;

    this.articulosImpresion.set(elegidos.map(({ articulo }) => ({
      codigo: articulo.codigo?.trim() || '—',
      descripcion: articulo.descripcion?.trim() || '—',
      cantidad: articulo.cantidad,
      bodega: articulo.codigoAlmacen?.trim() || '—',
    })));
    this.lineasPendientesRegistro = elegidos.map(({ identidad }) => identidad);
    this.fechaHoraImpresion.set(formatearFechaHoraHonduras(new Date(), true));
    this.preparandoImpresion.set(true);
    setTimeout(() => {
      window.print();
      this.confirmarImpresion();
    });
  }

  @HostListener('window:afterprint')
  public finalizarImpresion(): void {
    this.confirmarImpresion();
  }

  private cargarEstadoImpresion(): void {
    this.lineasSeleccionadas.set(new Set());
    this.lineasImpresas.set(new Set());
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
          if (this.pedido?.idOrigen !== idOrigenConsultado) return;
          this.lineasImpresas.set(new Set(datos.map(claveArticuloImpreso)));
        },
        error: () => undefined,
      });
  }

  private confirmarImpresion(): void {
    const lineas = this.lineasPendientesRegistro;
    if (lineas.length === 0) {
      this.preparandoImpresion.set(false);
      return;
    }
    this.lineasPendientesRegistro = [];
    this.preparandoImpresion.set(false);
    this.lineasSeleccionadas.set(new Set());
    this.impresionesService.registrar(lineas)
      .pipe(takeUntilDestroyed(this.destruirRef))
      .subscribe({
        next: ({ datos }) => {
          const impresas = new Set(this.lineasImpresas());
          datos.forEach((linea) => impresas.add(claveArticuloImpreso(linea)));
          this.lineasImpresas.set(impresas);
        },
        error: () => this.mensajeImpresion.set(
          'La impresión se abrió, pero no se pudo guardar el indicador.',
        ),
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
