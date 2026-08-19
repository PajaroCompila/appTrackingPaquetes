import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { RespuestaAlmacenes } from './almacen.interface';

@Injectable({ providedIn: 'root' })
export class AlmacenesService {
  private readonly clienteHttp = inject(HttpClient);

  public obtenerAlmacenes(): Observable<RespuestaAlmacenes> {
    return this.clienteHttp.get<RespuestaAlmacenes>(`${environment.urlApi}/almacenes`);
  }
}
