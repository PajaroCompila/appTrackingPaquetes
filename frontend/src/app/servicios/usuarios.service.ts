import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import type { Rol } from '../modelos/sesion';
export interface RegistroUsuario {
  sucursalId: number;
  nombres: string;
  apellidos: string;
  nombreUsuario: string;
  correoElectronico: string;
  rol: Rol;
}
export interface ActualizacionUsuario extends RegistroUsuario {
  activo: boolean;
  restablecerContrasena: boolean;
}
export interface ResultadoCreacion {
  usuario: UsuarioListado;
  contrasenaTemporal?: string;
}
export interface UsuarioListado {
  sucursalId: number;
  nombreSucursal: string;
  usuarioId: number;
  nombres: string;
  apellidos: string;
  nombreUsuario: string;
  correoElectronico: string;
  rol: Rol;
  activo: boolean;
  debeCambiarContrasena: boolean;
  fechaCreacion: string;
}
@Injectable({ providedIn: 'root' })
export class ServicioUsuarios {
  constructor(private readonly http: HttpClient) {}
  listar() {
    return this.http.get<UsuarioListado[]>('http://localhost:3000/api/usuarios', {
      withCredentials: true,
    });
  }
  crear(registro: RegistroUsuario) {
    return this.http.post<ResultadoCreacion>('http://localhost:3000/api/usuarios', registro, {
      withCredentials: true,
    });
  }
  actualizar(usuarioId: number, cambios: ActualizacionUsuario) {
    return this.http.patch<ResultadoCreacion>(
      `http://localhost:3000/api/usuarios/${usuarioId}`,
      cambios,
      {
        withCredentials: true,
      },
    );
  }
}
