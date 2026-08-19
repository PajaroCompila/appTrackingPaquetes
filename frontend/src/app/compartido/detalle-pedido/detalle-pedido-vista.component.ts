import { Component, EventEmitter, Input, Output } from '@angular/core';
import type {
  ArticuloDetalleVisual,
  ConfiguracionDetallePedido,
  ErrorDetalleVisual,
  PedidoDetalleVisual,
} from './detalle-pedido-vista.interface';

@Component({
  selector: 'app-detalle-pedido-vista',
  templateUrl: './detalle-pedido-vista.component.html',
  styleUrl: './detalle-pedido-vista.component.css',
})
export class DetallePedidoVistaComponent {
  @Input({ required: true }) public configuracion!: ConfiguracionDetallePedido;
  @Input() public pedido: PedidoDetalleVisual | null = null;
  @Input() public cargando = false;
  @Input() public error: ErrorDetalleVisual | null = null;
  @Output() public readonly regresar = new EventEmitter<void>();
  @Output() public readonly reintentar = new EventEmitter<void>();

  public valor(valor: string | number | null | undefined): string | number {
    return valor === null || valor === undefined || String(valor).trim() === ''
      ? 'No disponible'
      : valor;
  }

  public fecha(valor: string | null | undefined): string {
    if (!valor) return 'No disponible';
    const partesLocales = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(valor);
    const fecha = partesLocales
      ? new Date(Number(partesLocales[1]), Number(partesLocales[2]) - 1, Number(partesLocales[3]),
        Number(partesLocales[4]), Number(partesLocales[5]), Number(partesLocales[6] ?? 0))
      : new Date(valor);
    if (Number.isNaN(fecha.getTime())) return valor;
    return new Intl.DateTimeFormat('es-HN', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true,
    }).format(fecha).replace(',', '');
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

  private tieneValor(valor: string | null | undefined): boolean {
    return Boolean(valor?.trim());
  }
}
