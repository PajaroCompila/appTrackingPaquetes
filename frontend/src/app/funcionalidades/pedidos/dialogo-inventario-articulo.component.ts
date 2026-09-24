import { AfterViewInit, Component, ElementRef, EventEmitter, HostListener, Input, OnChanges, Output, SimpleChanges, ViewChild, inject } from '@angular/core';
import type { InventarioArticulo } from './pedido.interface';
import { PedidosService } from './pedidos.service';

export type EstadoConsultaInventario = 'cargando' | 'datos' | 'no-encontrado' | 'error';
export type EstadoImagenArticulo = 'cargando' | 'disponible' | 'no-disponible';

@Component({
  selector: 'app-dialogo-inventario-articulo',
  templateUrl: './dialogo-inventario-articulo.component.html',
  styleUrl: './dialogo-inventario-articulo.component.css',
})
export class DialogoInventarioArticuloComponent implements OnChanges, AfterViewInit {
  private readonly pedidosServicio = inject(PedidosService);
  @ViewChild('fondoDialogo', { static: true }) private fondoDialogo?: ElementRef<HTMLElement>;

  @Input({ required: true }) public estado!: EstadoConsultaInventario;
  @Input() public inventario: InventarioArticulo | null = null;
  @Output() public readonly cerrar = new EventEmitter<void>();

  public urlImagen = '';
  public estadoImagen: EstadoImagenArticulo = 'no-disponible';
  public visorImagenAbierto = false;
  public readonly soportaPopover = typeof HTMLElement !== 'undefined'
    && typeof HTMLElement.prototype.showPopover === 'function';

  public ngAfterViewInit(): void {
    if (this.soportaPopover) this.fondoDialogo?.nativeElement.showPopover();
  }

  public ngOnChanges(cambios: SimpleChanges): void {
    if (!cambios['inventario']) return;
    const codigoArticulo = this.inventario?.codigoArticulo?.trim();
    this.visorImagenAbierto = false;
    this.urlImagen = codigoArticulo
      ? this.pedidosServicio.obtenerUrlImagenArticulo(codigoArticulo)
      : '';
    this.estadoImagen = codigoArticulo ? 'cargando' : 'no-disponible';
  }

  @HostListener('document:keydown.escape', ['$event'])
  public cerrarConEscape(evento: Event): void {
    if (this.visorImagenAbierto) {
      evento.preventDefault();
      evento.stopImmediatePropagation();
      this.cerrarVisorImagen();
      return;
    }
    evento.preventDefault();
    evento.stopImmediatePropagation();
    this.cerrar.emit();
  }

  public imagenCargada(): void {
    this.estadoImagen = 'disponible';
  }

  public imagenNoDisponible(): void {
    this.estadoImagen = 'no-disponible';
    this.visorImagenAbierto = false;
  }

  public abrirVisorImagen(): void {
    if (this.estadoImagen === 'disponible') this.visorImagenAbierto = true;
  }

  public cerrarVisorImagen(): void {
    this.visorImagenAbierto = false;
  }

  public existenciaBaja(existenciaFisica: number): boolean {
    return existenciaFisica > 0 && existenciaFisica < 10;
  }

  public totalUnidades(): number {
    return this.inventario?.existencias?.reduce(
      (total, existencia) => total + existencia.existenciaFisica, 0,
    ) ?? 0;
  }

  public formatearUnidades(cantidad: number): string {
    return new Intl.NumberFormat('es-HN', { maximumFractionDigits: 2 }).format(cantidad);
  }
}
