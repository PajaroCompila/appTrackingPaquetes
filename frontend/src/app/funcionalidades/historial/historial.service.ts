import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { HistorialValidado, RespuestaHistorial } from './historial.interface';

export interface FiltrosHistorial {
  fechaDesde: string;
  fechaHasta: string;
  numeroPedido: string;
  codigosAlmacen: string[];
  pagina: number;
  cantidadPorPagina: number;
}

@Injectable({ providedIn: 'root' })
export class HistorialService {
  private readonly http = inject(HttpClient);

  public buscar(filtros: FiltrosHistorial): Observable<RespuestaHistorial> {
    let parametros = new HttpParams()
      .set('fechaDesde', filtros.fechaDesde)
      .set('fechaHasta', filtros.fechaHasta)
      .set('pagina', filtros.pagina)
      .set('cantidadPorPagina', filtros.cantidadPorPagina);
    if (filtros.numeroPedido.trim()) {
      parametros = parametros.set('numeroPedido', filtros.numeroPedido.trim());
    }
    for (const codigoAlmacen of filtros.codigosAlmacen) {
      parametros = parametros.append('codigoAlmacen', codigoAlmacen);
    }
    return this.http.get<RespuestaHistorial>(`${environment.urlApi}/historial-validados`, {
      params: parametros,
    });
  }

  public obtener(idOrigen: string): Observable<{ datos: HistorialValidado }> {
    return this.http.get<{ datos: HistorialValidado }>(
      `${environment.urlApi}/historial-validados/${encodeURIComponent(idOrigen)}`,
    );
  }
}
