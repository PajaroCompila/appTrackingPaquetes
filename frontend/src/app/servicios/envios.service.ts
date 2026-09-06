import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import type { ActualizacionEnvio, DatosEnvio, Envio, SeguimientoEnvio } from '../modelos/envio';

@Injectable({ providedIn: 'root' })
export class ServicioEnvios {
  private readonly url = 'http://localhost:3000/api/envios';
  private readonly opciones = {
    withCredentials: true,
  };
  constructor(private readonly http: HttpClient) {}
  listar() {
    return this.http.get<Envio[]>(this.url, this.opciones);
  }
  consultar(numeroGuia: string) {
    return this.http.get<SeguimientoEnvio>(`${this.url}/guia/${encodeURIComponent(numeroGuia)}`, this.opciones);
  }
  crear(datos: DatosEnvio) {
    return this.http.post<Envio>(this.url, datos, this.opciones);
  }
  actualizar(envioId: number, datos: ActualizacionEnvio) {
    return this.http.patch<Envio>(`${this.url}/${envioId}`, datos, this.opciones);
  }
  eliminar(envioId: number) {
    return this.http.delete<void>(`${this.url}/${envioId}`, this.opciones);
  }
}
