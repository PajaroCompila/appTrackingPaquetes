import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import type { FiltrosPedidos, PedidoResumen } from '../../funcionalidades/pedidos/pedido.interface';
import { SonidoNotificacionService } from './sonido-notificacion.service';

export interface NotificacionPedido {
  idOrigen: string;
  numeroPedido: string;
  codigosAlmacen: string[];
  nombreVendedor: string | null;
  fechaHoraPedido: string | null;
  cantidadArticulos: number;
}

@Injectable({ providedIn: 'root' })
export class PedidosNotificacionesService {
  private readonly destruirRef = inject(DestroyRef);
  private readonly sonido = inject(SonidoNotificacionService);
  private readonly conocidosDuranteSesion = new Set<string>();
  private readonly notificacionesActuales = signal<NotificacionPedido[]>([]);
  private firmaConsulta: string | null = null;
  private firmaAlmacenes: string | null = null;
  private temporizadorAnimacion: ReturnType<typeof setTimeout> | null = null;

  public readonly pedidosNuevos = this.notificacionesActuales.asReadonly();
  public readonly noLeidos = computed(() => this.notificacionesActuales().length);
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
    this.actualizarAlmacenesSeleccionados(filtros);
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
    const nuevos: NotificacionPedido[] = [];
    for (const [identidad, pedido] of identidades) {
      if (!this.conocidosDuranteSesion.has(identidad)
        && this.perteneceASeleccion(pedido, almacenes)) {
        nuevos.push(this.crearNotificacion(pedido));
      }
      this.conocidosDuranteSesion.add(identidad);
    }
    if (nuevos.length > 0) this.notificar(nuevos);
    return nuevos.length;
  }

  public marcarComoVistos(): void {
    this.limpiar();
  }

  public limpiar(): void {
    this.notificacionesActuales.set([]);
  }

  public reiniciarSesion(): void {
    this.conocidosDuranteSesion.clear();
    this.firmaConsulta = null;
    this.firmaAlmacenes = null;
    this.notificacionesActuales.set([]);
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

  private actualizarAlmacenesSeleccionados(filtros: FiltrosPedidos): void {
    const codigos = [...new Set((filtros.codigosAlmacen ?? [])
      .map((codigo) => codigo.trim()).filter(Boolean))].sort();
    const firmaActual = JSON.stringify(codigos);
    if (this.firmaAlmacenes !== null && this.firmaAlmacenes !== firmaActual) {
      const seleccion = new Set(codigos);
      this.notificacionesActuales.update((actuales) => actuales.filter((notificacion) =>
        seleccion.size === 0
        || notificacion.codigosAlmacen.some((codigo) => seleccion.has(codigo)),
      ));
    }
    this.firmaAlmacenes = firmaActual;
  }

  private crearNotificacion(pedido: PedidoResumen): NotificacionPedido {
    const codigosAlmacen = [...new Set([
      ...pedido.codigosAlmacen,
      ...pedido.articulos.flatMap(({ codigoAlmacen }) => codigoAlmacen ? [codigoAlmacen] : []),
    ].map((codigo) => codigo.trim()).filter(Boolean))];
    return {
      idOrigen: pedido.idOrigen,
      numeroPedido: pedido.numeroPedido,
      codigosAlmacen,
      nombreVendedor: pedido.nombreVendedor,
      fechaHoraPedido: pedido.fechaHoraPedido,
      cantidadArticulos: pedido.articulos.length,
    };
  }

  private notificar(nuevos: readonly NotificacionPedido[]): void {
    this.notificacionesActuales.update((actuales) => [...nuevos, ...actuales]);
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
