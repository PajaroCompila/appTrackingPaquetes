import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import type { EstadoImpresionArticulo, IdentidadArticuloImpresion, LineaRegistroImpresion } from './impresion.interface';

@Injectable({ providedIn: 'root' })
export class ImpresionesService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.urlApi}/impresiones`;

  public consultar(lineas: readonly IdentidadArticuloImpresion[]) {
    return this.http.post<{ datos: EstadoImpresionArticulo[] }>(`${this.url}/consultar`, { lineas });
  }

  public registrar(lineas: readonly LineaRegistroImpresion[]) {
    return this.http.post<{ datos: EstadoImpresionArticulo[] }>(`${this.url}/registrar`, { lineas });
  }
}
