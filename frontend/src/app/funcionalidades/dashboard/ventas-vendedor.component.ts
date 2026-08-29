import { DatePipe } from '@angular/common';
import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { BehaviorSubject, EMPTY, catchError, exhaustMap, switchMap, tap, timer } from 'rxjs';
import type { VentasVendedorDashboard } from './dashboard.interface';
import { DashboardService } from './dashboard.service';

const fechaLocal = (fecha: Date): string => {
  const anio = fecha.getFullYear(); const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0'); return `${anio}-${mes}-${dia}`;
};
const intervaloActualizacionVendedoresMs = 15000;

@Component({
  selector: 'app-ventas-vendedor',
  imports: [DatePipe, FormsModule, RouterLink],
  templateUrl: './ventas-vendedor.component.html',
  styleUrl: './ventas-vendedor.component.css',
})
export class VentasVendedorComponent implements OnInit {
  private readonly servicio = inject(DashboardService);
  private readonly ruta = inject(ActivatedRoute);
  private readonly enrutador = inject(Router);
  private readonly destruirRef = inject(DestroyRef);
  private readonly hoy = fechaLocal(new Date());
  private readonly aplicados = new BehaviorSubject({ fechaDesde: this.hoy, fechaHasta: this.hoy });
  public readonly codigoSucursal = this.ruta.snapshot.paramMap.get('codigoSucursal') ?? '';
  public filtros = { fechaDesde: this.hoy, fechaHasta: this.hoy };
  public readonly datos = signal<VentasVendedorDashboard | null>(null);
  public readonly cargando = signal(true);
  public readonly actualizando = signal(false);
  public readonly advertencia = signal('');

  public ngOnInit(): void {
    this.ruta.queryParamMap.pipe(takeUntilDestroyed(this.destruirRef)).subscribe((parametros) => {
      const guardados = this.leerFiltrosGuardados();
      this.filtros = { fechaDesde: parametros.get('fechaDesde') || guardados.fechaDesde || this.hoy,
        fechaHasta: parametros.get('fechaHasta') || guardados.fechaHasta || this.hoy };
      this.guardarFiltros();
      this.aplicados.next({ ...this.filtros });
    });
    this.aplicados.pipe(switchMap((filtros) => timer(0, intervaloActualizacionVendedoresMs).pipe(exhaustMap(() => {
      if (this.datos()) this.actualizando.set(true); else this.cargando.set(true);
      return this.servicio.obtenerVentasPorVendedor(
        this.codigoSucursal, filtros.fechaDesde, filtros.fechaHasta,
      ).pipe(tap((datos) => {
        this.datos.set(datos); this.cargando.set(false); this.actualizando.set(false); this.advertencia.set('');
      }), catchError(() => {
        this.cargando.set(false); this.actualizando.set(false);
        this.advertencia.set('No pudimos actualizar. Mostramos los datos anteriores.');
        return EMPTY;
      }));
    }))), takeUntilDestroyed(this.destruirRef)).subscribe();
  }

  public aplicarFiltros(): void { this.guardarFiltros(); void this.actualizarUrl(); }
  public limpiarFiltros(): void {
    this.filtros = { fechaDesde: this.hoy, fechaHasta: this.hoy };
    this.guardarFiltros();
    void this.actualizarUrl();
  }
  public ancho(ventas: number): number {
    const maximo = Math.max(1, ...(this.datos()?.porVendedor.map((item) => item.ventasValidadas) ?? [1]));
    return ventas === 0 ? 0 : Math.max(2, ventas / maximo * 100);
  }
  public nombreVendedor(nombre: string): string {
    const prefijo = this.datos()?.codigoSucursal.trim();
    if (!prefijo) return nombre;
    const seguro = prefijo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const limpio = nombre.replace(new RegExp(`^${seguro}(?:\\s*[-–—:]\\s*|\\s+)`, 'i'), '').trim();
    return limpio || nombre;
  }
  private async actualizarUrl(): Promise<void> {
    const navego = await this.enrutador.navigate([], { relativeTo: this.ruta, replaceUrl: true,
      queryParams: { fechaDesde: this.filtros.fechaDesde, fechaHasta: this.filtros.fechaHasta } });
    if (!navego) this.aplicados.next({ ...this.filtros });
  }

  private guardarFiltros(): void {
    try { localStorage.setItem(this.claveFiltros(), JSON.stringify(this.filtros)); }
    catch { /* La pantalla conserva los filtros mientras permanece abierta. */ }
  }
  private leerFiltrosGuardados(): Partial<{ fechaDesde: string; fechaHasta: string }> {
    try {
      const valor = JSON.parse(localStorage.getItem(this.claveFiltros()) ?? '{}');
      return valor && typeof valor === 'object' ? valor : {};
    } catch { return {}; }
  }
  private claveFiltros(): string { return `pedidosBodega.vendedores.${this.codigoSucursal}.filtros`; }
}
