import { CommonModule, DatePipe } from '@angular/common';
import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

type VistaPedidoDevuelto = 'pedido' | 'articulos';
type EstadoDevolucion = 'todos' | 'pendiente' | 'parcial' | 'devuelto';

interface FiltroPedidoDevuelto {
  numeroPedido: string;
  fechaDesde: string;
  fechaHasta: string;
  codigosAlmacen: string[];
  estado: EstadoDevolucion;
  cantidadPorPagina: 25 | 50 | 100;
}

interface AlmacenResumen {
  codigoAlmacen: string;
  nombreAlmacen: string;
}

@Component({
  selector: 'app-pedidos-devueltos',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, DatePipe],
  templateUrl: './pedidos-devueltos.component.html',
  styleUrl: './pedidos-devueltos.component.css',
})
export class PedidosDevueltosComponent {
  public readonly vista = signal<VistaPedidoDevuelto>('pedido');
  public readonly pagina = signal(1);
  public readonly cargando = signal(false);
  public readonly ultimaActualizacion = signal<Date | null>(null);
  public readonly almacenes = signal<AlmacenResumen[]>([
    { codigoAlmacen: 'BSPS01', nombreAlmacen: 'Bodega Central' },
    { codigoAlmacen: 'BSPS02', nombreAlmacen: 'Bodega Norte' },
    { codigoAlmacen: 'BSPS03', nombreAlmacen: 'Bodega Sur' },
  ]);
  public readonly filtros = signal<FiltroPedidoDevuelto>({
    numeroPedido: '',
    fechaDesde: this.fechaActual(),
    fechaHasta: this.fechaActual(),
    codigosAlmacen: [],
    estado: 'todos',
    cantidadPorPagina: 25,
  });

  public readonly pedidos = signal<unknown[]>([]);
  public readonly articulos = signal<unknown[]>([]);

  public buscar(): void {
    const filtrosActuales = this.filtros();
    this.cargando.set(false);
    this.ultimaActualizacion.set(new Date());
    if (filtrosActuales.numeroPedido || filtrosActuales.estado !== 'todos' || filtrosActuales.codigosAlmacen.length > 0) {
      this.pedidos.set([]);
      this.articulos.set([]);
      return;
    }
    this.pedidos.set([]);
    this.articulos.set([]);
  }

  public limpiarFiltros(): void {
    this.filtros.set({
      numeroPedido: '',
      fechaDesde: this.fechaActual(),
      fechaHasta: this.fechaActual(),
      codigosAlmacen: [],
      estado: 'todos',
      cantidadPorPagina: 25,
    });
    this.pagina.set(1);
    this.pedidos.set([]);
    this.articulos.set([]);
  }

  public cambiarVista(vista: VistaPedidoDevuelto): void {
    this.vista.set(vista);
  }

  public resumenAlmacenes(): string {
    const seleccionados = this.filtros().codigosAlmacen;
    if (seleccionados.length === 0) return 'Todos los almacenes';
    if (seleccionados.length === 1) return seleccionados[0] ?? '';
    return `${seleccionados.length} almacenes seleccionados`;
  }

  public estaSeleccionado(codigoAlmacen: string): boolean {
    return this.filtros().codigosAlmacen.includes(codigoAlmacen);
  }

  public alternarAlmacen(codigoAlmacen: string, seleccionado: boolean): void {
    const actuales = this.filtros().codigosAlmacen;
    const siguientes = seleccionado
      ? [...new Set([...actuales, codigoAlmacen])]
      : actuales.filter((codigo) => codigo !== codigoAlmacen);

    this.filtros.update((filtros) => ({ ...filtros, codigosAlmacen: siguientes }));
  }

  public limpiarAlmacenes(): void {
    this.filtros.update((filtros) => ({ ...filtros, codigosAlmacen: [] }));
  }

  public paginaAnterior(): void {
    if (this.pagina() > 1) {
      this.pagina.update((pagina) => pagina - 1);
    }
  }

  public paginaSiguiente(): void {
    this.pagina.update((pagina) => pagina + 1);
  }

  public fechaActual(): string {
    const hoy = new Date();
    const utcOffset = hoy.getTimezoneOffset() * 60000;
    return new Date(hoy.getTime() - utcOffset).toISOString().slice(0, 10);
  }

  public formatearFechaHora(valor: string | null | undefined): string {
    if (!valor) return '—';
    const fecha = new Date(valor);
    return Number.isNaN(fecha.getTime()) ? '—' : fecha.toLocaleString('es-HN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}
