import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import type { FiltrosPedidosDevueltos, PedidoDevuelto, SeleccionDevolucion } from './pedidos-devueltos.interface';
export interface RespuestaPedidosDevueltos {
  datos: PedidoDevuelto[];
  paginacion: { pagina: number; cantidadPorPagina: number; cantidadDevuelta: number; totalRegistros: number; hayMas: boolean };
}
@Injectable({ providedIn: 'root' })
export class PedidosDevueltosService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.urlApi}/pedidos-devueltos`;
  public listar(f: FiltrosPedidosDevueltos) {
    let params = new HttpParams().set('pagina',f.pagina).set('cantidadPorPagina',f.cantidadPorPagina)
      .set('vista',f.vista).set('estado',f.estado);
    for (const campo of ['numeroPedido','fechaDesde','fechaHasta'] as const) {
      if(f[campo].trim()) params=params.set(campo,f[campo].trim());
    }
    for(const codigo of f.codigosAlmacen) params=params.append('codigoAlmacen',codigo);
    return this.http.get<RespuestaPedidosDevueltos>(this.url,{params});
  }
  public obtener(id: string) {
    return this.http.get<{datos:PedidoDevuelto}>(`${this.url}/${encodeURIComponent(id)}`);
  }
  public confirmar(lineas: SeleccionDevolucion[]) {
    return this.http.post<{exito:boolean}>(`${this.url}/confirmar`,{lineas});
  }
}
