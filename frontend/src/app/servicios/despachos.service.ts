import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import type { DatosDespacho, Despacho, PaqueteParaDespacho } from '../modelos/despacho';

@Injectable({ providedIn: 'root' })
export class ServicioDespachos {
  private readonly url = 'http://localhost:3000/api/despachos';
  private readonly opciones = { withCredentials: true };

  constructor(private readonly http: HttpClient) {}

  listar() {
    return this.http.get<Despacho[]>(this.url, this.opciones);
  }

  listarPaquetesDisponibles() {
    return this.http.get<PaqueteParaDespacho[]>(`${this.url}/paquetes`, this.opciones);
  }

  crear(datos: DatosDespacho) {
    return this.http.post<Despacho>(this.url, datos, this.opciones);
  }
}
