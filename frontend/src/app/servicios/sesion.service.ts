import { HttpClient } from '@angular/common/http';
import { Injectable, signal } from '@angular/core';
import { catchError, map, Observable, of, tap } from 'rxjs';
import type { IdentidadAutenticada } from '../modelos/sesion';

const API = 'http://localhost:3000/api';
@Injectable({ providedIn: 'root' })
export class ServicioSesion {
  readonly usuario = signal<IdentidadAutenticada | null>(null);
  constructor(private readonly http: HttpClient) {}
  iniciar(nombreUsuario: string, contrasena: string): Observable<void> {
    return this.http
      .post<{ usuario: IdentidadAutenticada }>(
        `${API}/sesion/iniciar`,
        { nombreUsuario, contrasena },
        { withCredentials: true },
      )
      .pipe(
        tap((respuesta) => this.usuario.set(respuesta.usuario)),
        map(() => undefined),
      );
  }
  comprobar(): Observable<boolean> {
    return this.http
      .get<{ usuario: IdentidadAutenticada }>(`${API}/sesion/actual`, { withCredentials: true })
      .pipe(
        tap((respuesta) => this.usuario.set(respuesta.usuario)),
        map(() => true),
        catchError(() => {
          this.usuario.set(null);
          return of(false);
        }),
      );
  }
  cerrar(): Observable<void> {
    return this.http
      .post<void>(`${API}/sesion/cerrar`, {}, { withCredentials: true })
      .pipe(tap(() => this.usuario.set(null)));
  }
}
