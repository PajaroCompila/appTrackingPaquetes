import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
export interface UsuarioReceptor {
  usuarioId: number;
  nombreUsuario: string;
}
export interface Recepcion {
  recepcionId: number;
  envioId: number;
  numeroGuia: string;
  usuarioRecibeId: number;
  nombreUsuario: string;
  entregaFinal: boolean;
  fechaRecepcion: string;
}
@Injectable({ providedIn: 'root' })
export class ServicioRecepciones {
  private url = 'http://localhost:3000/api/recepciones';
  private opciones = { withCredentials: true };
  constructor(private http: HttpClient) {}
  listar() {
    return this.http.get<Recepcion[]>(this.url, this.opciones);
  }
  usuarios() {
    return this.http.get<UsuarioReceptor[]>(`${this.url}/usuarios`, this.opciones);
  }
  crear(datos: { envioId: number; usuarioRecibeId: number }) {
    return this.http.post<Recepcion>(this.url, datos, this.opciones);
  }
  crearLote(datos: { envioIds: number[]; usuarioRecibeId: number }) {
    return this.http.post<Recepcion[]>(`${this.url}/lote`, datos, this.opciones);
  }
}
