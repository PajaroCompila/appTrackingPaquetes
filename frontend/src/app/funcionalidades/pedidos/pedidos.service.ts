import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import type {
  FiltrosPedidos,
  InventarioArticulo,
  RespuestaDetallePedido,
  RespuestaListaPedidos,
} from './pedido.interface';

@Injectable({ providedIn: 'root' })
export class PedidosService {
  private readonly clienteHttp = inject(HttpClient);

  public obtenerPedidos(filtros: FiltrosPedidos): Observable<RespuestaListaPedidos> {
    let parametros = new HttpParams()
      .set('pagina', filtros.pagina)
      .set('cantidadPorPagina', filtros.cantidadPorPagina);

    const filtrosOpcionales: [string, string | undefined][] = [
      ['numeroPedido', filtros.numeroPedido],
      ['fechaDesde', filtros.fechaDesde],
      ['fechaHasta', filtros.fechaHasta],
      ['codigoEstadoVenta', filtros.codigoEstadoVenta],
      ['codigoSincronizacion', filtros.codigoSincronizacion],
    ];
    for (const [nombre, valor] of filtrosOpcionales) {
      if (valor?.trim()) {
        parametros = parametros.set(nombre, valor.trim());
      }
    }
    for (const codigoAlmacen of filtros.codigosAlmacen ?? []) {
      const codigo = codigoAlmacen.trim();
      if (codigo) {
        parametros = parametros.append('codigoAlmacen', codigo);
      }
    }

    return this.clienteHttp.get<RespuestaListaPedidos>(`${environment.urlApi}/pedidos`, {
      params: parametros,
    });
  }

  public obtenerDetallePedido(
    folioPedido: string,
    codigosAlmacen: string[] = [],
  ): Observable<RespuestaDetallePedido> {
    const folioCodificado = encodeURIComponent(folioPedido);
    let parametros = new HttpParams();
    for (const codigoAlmacen of codigosAlmacen) {
      parametros = parametros.append('codigoAlmacen', codigoAlmacen);
    }
    return this.clienteHttp.get<RespuestaDetallePedido>(
      `${environment.urlApi}/pedidos/${folioCodificado}`,
      { params: parametros },
    );
  }

  public obtenerInventarioArticulo(
    codigoArticulo: string,
    codigoAlmacen: string,
  ): Observable<InventarioArticulo> {
    return this.clienteHttp.get<InventarioArticulo>(
      `${environment.urlApi}/articulos/${encodeURIComponent(codigoArticulo)}/inventario`,
      { params: new HttpParams().set('codigoAlmacen', codigoAlmacen) },
    );
  }

  public despacharLineas(lineas: { idOrigen: string; identificadorDetalle: string }[]) {
    return this.clienteHttp.post<{ datos: {
      transferidas: { idOrigen: string; identificadorDetalle: string }[];
      omitidas: { idOrigen: string; identificadorDetalle: string }[];
      rechazadas: { idOrigen: string; identificadorDetalle: string }[];
    } }>(`${environment.urlApi}/pedidos-despachados`, { lineas });
  }
}
