import { Component, DestroyRef, HostListener, inject, signal } from '@angular/core';
import { CerrarTooltipNavegacionDirective } from './compartido/interaccion/cerrar-tooltip-navegacion.directive';
import { NavigationEnd, NavigationStart, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { AutenticacionService } from './funcionalidades/autenticacion/autenticacion.service';
import { ConsultaInventarioArticuloHostComponent } from './compartido/inventario/consulta-inventario-articulo-host.component';
import { ConsultaInventarioArticuloService } from './compartido/inventario/consulta-inventario-articulo.service';
import {
  PedidosNotificacionesService,
  type NotificacionPedido,
} from './compartido/notificaciones/pedidos-notificaciones.service';
import { SonidoNotificacionService } from './compartido/notificaciones/sonido-notificacion.service';
import { formatearFechaHoraHonduras } from './compartido/fechas/fecha-honduras';
import { PedidosNotificacionesGlobalesService } from './compartido/notificaciones/pedidos-notificaciones-globales.service';

@Component({
  selector: 'app-root',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, ConsultaInventarioArticuloHostComponent, CerrarTooltipNavegacionDirective],
  templateUrl: './app.html',
  styleUrls: ['./app.css', './app-notificaciones.css'],
})
export class App {
  private readonly router = inject(Router);
  private readonly autenticacion = inject(AutenticacionService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly consultaInventario = inject(ConsultaInventarioArticuloService);
  public readonly notificaciones = inject(PedidosNotificacionesService);
  public readonly sonidoNotificaciones = inject(SonidoNotificacionService);
  public readonly esLogin = signal(this.router.url.startsWith('/login'));
  public readonly panelNotificacionesAbierto = signal(false);
  public readonly usuario = this.autenticacion.usuario;
  private readonly notificacionesGlobales = inject(PedidosNotificacionesGlobalesService);

  public constructor() {
    this.notificacionesGlobales.iniciar();
    this.router.events.pipe(
      filter((evento): evento is NavigationStart => evento instanceof NavigationStart),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(() => {
      this.consultaInventario.cerrar();
      this.panelNotificacionesAbierto.set(false);
    });
    this.router.events.pipe(
      filter((evento): evento is NavigationEnd => evento instanceof NavigationEnd),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe((evento) => this.esLogin.set(evento.urlAfterRedirects.startsWith('/login')));
  }

  public cerrarSesion(): void {
    this.autenticacion.cerrarSesion().subscribe({
      next: () => void this.router.navigate(['/login']),
      error: () => undefined,
    });
  }

  public textoCampana(): string {
    const cantidad = this.notificaciones.noLeidos();
    if (cantidad === 0) return 'Pedidos nuevos';
    return cantidad === 1 ? '1 pedido nuevo' : `${cantidad} pedidos nuevos`;
  }

  public contadorCampana(): string {
    const cantidad = this.notificaciones.noLeidos();
    return cantidad > 99 ? '99+' : String(cantidad);
  }

  public alternarPanelNotificaciones(): void {
    this.panelNotificacionesAbierto.update((abierto) => !abierto);
  }

  public alternarSonidoNotificaciones(): void {
    this.sonidoNotificaciones.alternar();
  }

  public textoSonidoNotificaciones(): string {
    return this.sonidoNotificaciones.activo()
      ? 'Desactivar sonido de notificaciones'
      : 'Activar sonido de notificaciones';
  }

  public limpiarNotificaciones(): void {
    this.notificaciones.limpiar();
  }

  public abrirDetalleNotificacion(notificacion: NotificacionPedido): void {
    this.panelNotificacionesAbierto.set(false);
    void this.router.navigate(['/pedidos', notificacion.idOrigen], {
      queryParams: {
        retorno: '/pedidos',
        codigoAlmacen: notificacion.codigosAlmacen,
      },
    });
  }

  public fechaHoraNotificacion(valor: string | null): string {
    return formatearFechaHoraHonduras(valor);
  }

  public almacenesNotificacion(codigos: readonly string[]): string {
    return codigos.join(', ') || 'Sin bodega';
  }

  public cantidadArticulosNotificacion(cantidad: number): string {
    return cantidad === 1 ? '1 artículo' : `${cantidad} artículos`;
  }

  @HostListener('document:click', ['$event'])
  public cerrarPanelNotificaciones(evento: MouseEvent): void {
    if (evento.target instanceof Element
      && evento.target.closest('.contenedor-notificaciones')) return;
    this.panelNotificacionesAbierto.set(false);
  }

  @HostListener('document:keydown.escape')
  public cerrarPanelNotificacionesConEscape(): void {
    this.panelNotificacionesAbierto.set(false);
  }
}
