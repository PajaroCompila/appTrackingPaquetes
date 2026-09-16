import { DestroyRef, Injectable, inject } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { EMPTY, catchError, distinctUntilChanged, exhaustMap, map, switchMap, timer } from 'rxjs';
import { FiltrosGlobalesService } from '../filtros-globales.service';
import { obtenerFechaLocalActual } from '../estado-filtros-sesion';
import { AutenticacionService } from '../../funcionalidades/autenticacion/autenticacion.service';
import type { FiltrosPedidos } from '../../funcionalidades/pedidos/pedido.interface';
import { PedidosService } from '../../funcionalidades/pedidos/pedidos.service';
import { PedidosNotificacionesService } from './pedidos-notificaciones.service';

const intervaloNotificacionesMs = 5000;

@Injectable({ providedIn: 'root' })
export class PedidosNotificacionesGlobalesService {
  private readonly autenticacion = inject(AutenticacionService);
  private readonly destruirRef = inject(DestroyRef);
  private readonly filtrosGlobales = inject(FiltrosGlobalesService);
  private readonly pedidosService = inject(PedidosService);
  private readonly notificaciones = inject(PedidosNotificacionesService);
  private readonly usuario$ = toObservable(this.autenticacion.usuario);
  private iniciado = false;

  public iniciar(): void {
    if (this.iniciado) return;
    this.iniciado = true;

    this.usuario$.pipe(
      distinctUntilChanged((anterior, actual) => anterior?.usuarioId === actual?.usuarioId),
      switchMap((usuario) => usuario
        ? timer(0, intervaloNotificacionesMs).pipe(
          exhaustMap(() => this.consultar()),
        )
        : EMPTY),
      takeUntilDestroyed(this.destruirRef),
    ).subscribe(({ datos, filtros }) => {
      this.notificaciones.procesarRespuesta(datos, filtros, false);
    });
  }

  private consultar() {
    const filtrosGuardados = this.filtrosGlobales.obtener();
    const fechaActual = obtenerFechaLocalActual();
    const filtros: FiltrosPedidos = {
      fechaDesde: fechaActual,
      fechaHasta: fechaActual,
      codigosAlmacen: filtrosGuardados.codigosAlmacen,
      pagina: 1,
      cantidadPorPagina: 100,
      vista: 'pedido',
      orden: 'desc',
    };
    return this.pedidosService.obtenerPedidos(filtros).pipe(
      map((respuesta) => ({ datos: respuesta.datos, filtros })),
      catchError(() => EMPTY),
    );
  }
}
