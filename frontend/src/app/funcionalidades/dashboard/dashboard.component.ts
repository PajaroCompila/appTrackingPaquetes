import { DatePipe } from '@angular/common';
import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { BehaviorSubject, EMPTY, catchError, exhaustMap, switchMap, tap, timer } from 'rxjs';
import type { DashboardPedidos, FiltrosDashboard, ResumenTiendaDashboard } from './dashboard.interface';
import { DashboardService } from './dashboard.service';

function fechaLocal(fecha: Date): string {
  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}
const claveFiltrosDashboard = 'pedidosBodega.dashboard.filtros';
const intervaloActualizacionDashboardMs = 15000;

@Component({
  selector: 'app-dashboard',
  imports: [DatePipe, FormsModule, RouterLink],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
})
export class DashboardComponent implements OnInit {
  private readonly servicio = inject(DashboardService);
  private readonly ruta = inject(ActivatedRoute);
  private readonly enrutador = inject(Router);
  private readonly destruirRef = inject(DestroyRef);
  private readonly hoy = fechaLocal(new Date());
  private readonly filtrosAplicados = new BehaviorSubject<FiltrosDashboard>({
    fechaDesde: this.hoy, fechaHasta: this.hoy, codigoTienda: '',
  });
  public filtros: FiltrosDashboard = { fechaDesde: this.hoy, fechaHasta: this.hoy, codigoTienda: '' };
  public readonly datos = signal<DashboardPedidos | null>(null);
  public readonly cargandoInicial = signal(true);
  public readonly actualizando = signal(false);
  public readonly advertencia = signal('');

  public ngOnInit(): void {
    this.hidratarFiltros();
    this.filtrosAplicados.next({ ...this.filtros });
    this.filtrosAplicados.pipe(
      switchMap((filtros) => timer(0, intervaloActualizacionDashboardMs).pipe(
        exhaustMap(() => {
          this.actualizando.set(true);
          return this.servicio.obtener(filtros).pipe(
            tap((datos) => {
              this.datos.set(datos);
              this.cargandoInicial.set(false);
              this.actualizando.set(false);
              this.advertencia.set('');
            }),
            catchError(() => {
              this.cargandoInicial.set(false);
              this.actualizando.set(false);
              this.advertencia.set('No pudimos actualizar. Mostramos los datos anteriores.');
              return EMPTY;
            }),
          );
        }),
      )),
      takeUntilDestroyed(this.destruirRef),
    ).subscribe();
  }

  public aplicarFiltros(): void {
    this.guardarFiltros();
    void this.actualizarUrl();
    this.filtrosAplicados.next({ ...this.filtros });
  }

  public limpiarFiltros(): void {
    this.filtros = { fechaDesde: this.hoy, fechaHasta: this.hoy, codigoTienda: '' };
    this.aplicarFiltros();
  }

  public ancho(valor: number): number {
    const maximo = Math.max(1, ...(this.datos()?.porTienda.flatMap((tienda) =>
      [tienda.pendientes, tienda.validados]) ?? [1]));
    return valor === 0 ? 0 : Math.max(2, valor / maximo * 100);
  }

  public identificadorTienda(tienda: ResumenTiendaDashboard): string {
    return tienda.nombreTienda || tienda.codigoTienda || 'Sin tienda registrada';
  }

  public sucursalesNoDisponibles(): string[] {
    return this.datos()?.porTienda.filter((tienda) => !tienda.disponible)
      .map((tienda) => tienda.nombreTienda || tienda.codigoTienda || 'Sucursal sin identificar') ?? [];
  }

  private hidratarFiltros(): void {
    const parametros = this.ruta.snapshot.queryParamMap;
    const guardados = this.leerFiltrosGuardados();
    this.filtros = {
      fechaDesde: parametros.get('fechaDesde') || guardados.fechaDesde || this.hoy,
      fechaHasta: parametros.get('fechaHasta') || guardados.fechaHasta || this.hoy,
      codigoTienda: parametros.get('codigoTienda') || guardados.codigoTienda || '',
    };
    this.guardarFiltros();
  }

  private guardarFiltros(): void {
    try { localStorage.setItem(claveFiltrosDashboard, JSON.stringify(this.filtros)); }
    catch { /* La pantalla conserva los filtros mientras permanece abierta. */ }
  }

  private leerFiltrosGuardados(): Partial<FiltrosDashboard> {
    try {
      const valor = JSON.parse(localStorage.getItem(claveFiltrosDashboard) ?? '{}');
      return valor && typeof valor === 'object' ? valor as Partial<FiltrosDashboard> : {};
    } catch { return {}; }
  }

  private actualizarUrl(): Promise<boolean> {
    return this.enrutador.navigate([], { relativeTo: this.ruta, replaceUrl: true, queryParams: {
      fechaDesde: this.filtros.fechaDesde, fechaHasta: this.filtros.fechaHasta,
      codigoTienda: this.filtros.codigoTienda || null,
    } });
  }
}
