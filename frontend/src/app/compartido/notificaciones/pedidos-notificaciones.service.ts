import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import type { FiltrosPedidos, PedidoResumen } from '../../funcionalidades/pedidos/pedido.interface';
import { SonidoNotificacionService } from './sonido-notificacion.service';

@Injectable({ providedIn: 'root' })
export class PedidosNotificacionesService {
  private readonly destruirRef = inject(DestroyRef);
  private readonly sonido = inject(SonidoNotificacionService);
  private readonly conocidosDuranteSesion = new Set<string>();
  private firmaConsulta: string | null = null;
  private temporizadorAnimacion: ReturnType<typeof setTimeout> | null = null;

  public readonly noLeidos = signal(0);
  public readonly animando = signal(false);

  public constructor() {
    this.destruirRef.onDestroy(() => {
      if (this.temporizadorAnimacion) clearTimeout(this.temporizadorAnimacion);
    });
  }

  public procesarRespuesta(
    pedidos: readonly PedidoResumen[],
    filtros: FiltrosPedidos,
    establecerBaseline: boolean,
  ): number {
    const firmaActual = this.crearFirmaConsulta(filtros);
    const identidades = new Map<string, PedidoResumen>();
    for (const pedido of pedidos) {
      const identidad = pedido.idOrigen.trim();
      if (identidad) identidades.set(identidad, pedido);
    }

    const requiereBaseline = establecerBaseline
      || this.firmaConsulta === null
      || this.firmaConsulta !== firmaActual;
    this.firmaConsulta = firmaActual;
    if (requiereBaseline) {
      for (const identidad of identidades.keys()) this.conocidosDuranteSesion.add(identidad);
      return 0;
    }

    const almacenes = new Set((filtros.codigosAlmacen ?? []).map((codigo) => codigo.trim()));
    let nuevos = 0;
    for (const [identidad, pedido] of identidades) {
      if (!this.conocidosDuranteSesion.has(identidad)
        && this.perteneceASeleccion(pedido, almacenes)) {
        nuevos += 1;
      }
      this.conocidosDuranteSesion.add(identidad);
    }
    if (nuevos > 0) this.notificar(nuevos);
    return nuevos;
  }

  public marcarComoVistos(): void {
    this.noLeidos.set(0);
  }

  public reiniciarSesion(): void {
    this.conocidosDuranteSesion.clear();
    this.firmaConsulta = null;
    this.noLeidos.set(0);
    this.animando.set(false);
    if (this.temporizadorAnimacion) clearTimeout(this.temporizadorAnimacion);
    this.temporizadorAnimacion = null;
  }

  private perteneceASeleccion(pedido: PedidoResumen, almacenes: ReadonlySet<string>): boolean {
    if (almacenes.size === 0) return true;
    return pedido.codigosAlmacen.some((codigo) => almacenes.has(codigo.trim()))
      || pedido.articulos.some(({ codigoAlmacen }) =>
        codigoAlmacen !== null && almacenes.has(codigoAlmacen.trim()));
  }

  private crearFirmaConsulta(filtros: FiltrosPedidos): string {
    return JSON.stringify({
      numeroPedido: filtros.numeroPedido?.trim() ?? '',
      fechaDesde: filtros.fechaDesde ?? '',
      fechaHasta: filtros.fechaHasta ?? '',
      almacenes: [...(filtros.codigosAlmacen ?? [])].map((codigo) => codigo.trim()).sort(),
      codigoEstadoVenta: filtros.codigoEstadoVenta?.trim() ?? '',
      codigoSincronizacion: filtros.codigoSincronizacion?.trim() ?? '',
      pagina: filtros.pagina,
      cantidadPorPagina: filtros.cantidadPorPagina,
    });
  }

  private notificar(cantidad: number): void {
    this.noLeidos.update((actual) => actual + cantidad);
    this.animando.set(false);
    if (this.temporizadorAnimacion) clearTimeout(this.temporizadorAnimacion);
    queueMicrotask(() => {
      this.animando.set(true);
      this.temporizadorAnimacion = setTimeout(() => {
        this.animando.set(false);
        this.temporizadorAnimacion = null;
      }, 450);
    });
    this.sonido.reproducir();
  }
}
