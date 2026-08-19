import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import type { DashboardPedidos, FiltrosDashboard, VentasVendedorDashboard } from './dashboard.interface';

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private readonly http = inject(HttpClient);

  public obtener(filtros: FiltrosDashboard) {
    let parametros = new HttpParams().set('fechaDesde', filtros.fechaDesde)
      .set('fechaHasta', filtros.fechaHasta);
    if (filtros.codigoTienda) parametros = parametros.set('codigoTienda', filtros.codigoTienda);
    return this.http.get<DashboardPedidos>(`${environment.urlApi}/dashboard/pedidos`, { params: parametros });
  }

  public obtenerVentasPorVendedor(codigoSucursal: string, fechaDesde: string, fechaHasta: string) {
    const parametros = new HttpParams().set('codigoSucursal', codigoSucursal)
      .set('fechaDesde', fechaDesde).set('fechaHasta', fechaHasta);
    return this.http.get<VentasVendedorDashboard>(
      `${environment.urlApi}/dashboard/ventas-por-vendedor`, { params: parametros },
    );
  }
}
