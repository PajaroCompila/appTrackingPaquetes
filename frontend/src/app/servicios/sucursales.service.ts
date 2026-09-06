import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import type { CatalogoUbicaciones, DatosSucursal, Sucursal } from '../modelos/sucursal';

@Injectable({ providedIn: 'root' })
export class ServicioSucursales {
  private readonly url = 'http://localhost:3000/api/sucursales';
  private readonly opciones = {
    withCredentials: true,
  };

  constructor(private readonly http: HttpClient) {}

  listar() {
    return this.http.get<Sucursal[]>(this.url, this.opciones);
  }

  listarUbicaciones() {
    return this.http.get<CatalogoUbicaciones>('http://localhost:3000/api/ubicaciones', this.opciones);
  }

  crear(datos: DatosSucursal) {
    return this.http.post<Sucursal>(this.url, datos, this.opciones);
  }

  actualizar(sucursalId: number, datos: DatosSucursal) {
    return this.http.patch<Sucursal>(`${this.url}/${sucursalId}`, datos, this.opciones);
  }
}
