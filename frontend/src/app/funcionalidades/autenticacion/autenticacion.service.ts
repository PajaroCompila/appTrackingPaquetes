import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { EMPTY, Subscription, catchError, exhaustMap, tap, timer } from 'rxjs';
import { environment } from '../../../environments/environment';
import { limpiarFiltrosSesion } from '../../compartido/estado-filtros-sesion';
import { FiltrosGlobalesService } from '../../compartido/filtros-globales.service';
import { PedidosNotificacionesService } from '../../compartido/notificaciones/pedidos-notificaciones.service';
import type { RespuestaSesion } from './autenticacion.interface';

const intervaloRenovacionSesionMs = 5 * 60_000;

@Injectable({ providedIn: 'root' })
export class AutenticacionService {
  private readonly http = inject(HttpClient);
  private readonly filtrosGlobales = inject(FiltrosGlobalesService);
  private readonly notificaciones = inject(PedidosNotificacionesService);
  private renovacionSesion?: Subscription;
  public readonly usuario = signal<RespuestaSesion['usuario'] | null>(null);

  public iniciarSesion(nombreUsuario: string, contrasena: string) {
    return this.http.post<RespuestaSesion>(
      `${environment.urlApi}/autenticacion/iniciar-sesion`,
      { nombreUsuario, contrasena },
    ).pipe(tap(({ usuario }) => {
      limpiarFiltrosSesion();
      this.filtrosGlobales.reiniciar();
      this.notificaciones.reiniciarSesion();
      this.establecerSesion(usuario);
    }));
  }

  public consultarSesion() {
    return this.http.get<RespuestaSesion>(`${environment.urlApi}/autenticacion/sesion`).pipe(
      tap(({ usuario }) => this.establecerSesion(usuario)),
    );
  }

  public cerrarSesion() {
    return this.http.post<void>(`${environment.urlApi}/autenticacion/cerrar-sesion`, {}).pipe(
      tap(() => {
        limpiarFiltrosSesion();
        this.notificaciones.reiniciarSesion();
        this.limpiarSesion();
      }),
    );
  }

  public cambiarContrasena(
    contrasenaActual: string,
    nuevaContrasena: string,
    confirmarContrasena: string,
  ) {
    return this.http.post<void>(`${environment.urlApi}/autenticacion/cambiar-contrasena`, {
      contrasenaActual,
      nuevaContrasena,
      confirmarContrasena,
    }).pipe(tap(() => this.usuario.update((usuario) => usuario
      ? { ...usuario, debeCambiarContrasena: false }
      : usuario)));
  }

  public limpiarSesion(): void {
    this.detenerRenovacionAutomatica();
    this.usuario.set(null);
  }

  private establecerSesion(usuario: RespuestaSesion['usuario']): void {
    this.usuario.set(usuario);
    this.iniciarRenovacionAutomatica();
  }

  private iniciarRenovacionAutomatica(): void {
    if (this.renovacionSesion || !this.usuario()) return;
    this.renovacionSesion = timer(intervaloRenovacionSesionMs, intervaloRenovacionSesionMs).pipe(
      exhaustMap(() => {
        if (!this.usuario()) return EMPTY;
        return this.http.get<RespuestaSesion>(`${environment.urlApi}/autenticacion/sesion`).pipe(
          tap(({ usuario }) => this.usuario.set(usuario)),
          catchError(() => EMPTY),
        );
      }),
    ).subscribe();
  }

  private detenerRenovacionAutomatica(): void {
    this.renovacionSesion?.unsubscribe();
    this.renovacionSesion = undefined;
  }
}
