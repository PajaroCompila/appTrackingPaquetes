import { DestroyRef, Injectable, Injector, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import type { Subscription } from 'rxjs';
import type { InventarioArticulo } from '../../funcionalidades/pedidos/pedido.interface';
import { PedidosService } from '../../funcionalidades/pedidos/pedidos.service';
import type { EstadoConsultaInventario } from '../../funcionalidades/pedidos/dialogo-inventario-articulo.component';

@Injectable({ providedIn: 'root' })
export class ConsultaInventarioArticuloService {
  private readonly inyector = inject(Injector);
  private readonly destruirRef = inject(DestroyRef);
  private consultaActiva: Subscription | null = null;
  private claveConsulta: string | null = null;

  public readonly abierto = signal(false);
  public readonly estado = signal<EstadoConsultaInventario>('cargando');
  public readonly inventario = signal<InventarioArticulo | null>(null);

  public abrir(codigoArticuloRecibido: string | null | undefined, codigoAlmacenRecibido: string | null | undefined): void {
    const codigoArticulo = codigoArticuloRecibido?.trim();
    const codigoAlmacen = codigoAlmacenRecibido?.trim();
    if (!codigoArticulo || !codigoAlmacen) return;

    const clave = `${codigoArticulo}\u0000${codigoAlmacen}`;
    if (this.claveConsulta === clave && this.consultaActiva) return;

    this.consultaActiva?.unsubscribe();
    this.abierto.set(true);
    this.estado.set('cargando');
    this.inventario.set(null);
    this.claveConsulta = clave;

    const consulta = this.inyector.get(PedidosService)
      .obtenerInventarioArticulo(codigoArticulo, codigoAlmacen)
      .pipe(takeUntilDestroyed(this.destruirRef))
      .subscribe({
        next: (inventario) => {
          this.inventario.set(inventario);
          this.estado.set('datos');
          this.finalizarConsulta(clave);
        },
        error: (error: { status?: number }) => {
          this.estado.set(error.status === 404 ? 'no-encontrado' : 'error');
          this.finalizarConsulta(clave);
        },
      });
    this.consultaActiva = consulta.closed ? null : consulta;
  }

  public cerrar(): void {
    this.abierto.set(false);
    this.consultaActiva?.unsubscribe();
    this.consultaActiva = null;
    this.claveConsulta = null;
  }

  private finalizarConsulta(clave: string): void {
    if (this.claveConsulta !== clave) return;
    this.consultaActiva = null;
    this.claveConsulta = null;
  }
}
