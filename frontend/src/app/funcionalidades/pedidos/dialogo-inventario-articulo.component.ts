import { Component, EventEmitter, HostListener, Input, Output } from '@angular/core';
import type { InventarioArticulo } from './pedido.interface';

export type EstadoConsultaInventario = 'cargando' | 'datos' | 'no-encontrado' | 'error';

@Component({
  selector: 'app-dialogo-inventario-articulo',
  templateUrl: './dialogo-inventario-articulo.component.html',
  styleUrl: './dialogo-inventario-articulo.component.css',
})
export class DialogoInventarioArticuloComponent {
  @Input({ required: true }) public estado!: EstadoConsultaInventario;
  @Input() public inventario: InventarioArticulo | null = null;
  @Output() public readonly cerrar = new EventEmitter<void>();

  @HostListener('document:keydown.escape')
  public cerrarConEscape(): void {
    this.cerrar.emit();
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
