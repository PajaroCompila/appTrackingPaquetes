import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import type { RespuestaSalud } from './salud.interface';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class SaludService {
  private readonly clienteHttp = inject(HttpClient);

  public obtenerEstado(): Observable<RespuestaSalud> {
    return this.clienteHttp.get<RespuestaSalud>(`${environment.urlApi}/salud`);
  }
}
