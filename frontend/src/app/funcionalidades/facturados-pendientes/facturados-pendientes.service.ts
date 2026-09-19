import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import type { FacturadoPendiente, FiltrosFacturadosPendientes, LineaFacturadaPendiente,
  RespuestaFacturadosPendientes } from './facturados-pendientes.interface';

@Injectable({providedIn:'root'})
export class FacturadosPendientesService {
  private readonly http=inject(HttpClient);
  private readonly url=`${environment.urlApi}/facturados-pendientes`;
  public listar(f:FiltrosFacturadosPendientes) {
    let params=new HttpParams().set('pagina',f.pagina).set('cantidadPorPagina',f.cantidadPorPagina).set('vista',f.vista);
    for (const clave of ['numeroPedido','fechaDesde','fechaHasta'] as const) if (f[clave]) params=params.set(clave,f[clave]);
    for (const codigo of f.codigosAlmacen) params=params.append('codigoAlmacen',codigo);
    return this.http.get<RespuestaFacturadosPendientes>(this.url,{params});
  }
  public obtener(id:string) {return this.http.get<{datos:FacturadoPendiente}>(`${this.url}/${encodeURIComponent(id)}`);}
  public confirmar(linea:LineaFacturadaPendiente) {
    return this.http.post<{exito:boolean}>(`${this.url}/confirmar`,{lineas:[{
      idOrigen:linea.idOrigen,identificadorDetalle:linea.identificadorDetalle,version:linea.version,
    }]});
  }
}
