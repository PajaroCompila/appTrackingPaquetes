import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { RespuestaSesion } from './autenticacion.interface';
import { limpiarFiltrosSesion } from '../../compartido/estado-filtros-sesion';
@Injectable({ providedIn: 'root' })
export class AutenticacionService {
  private readonly http = inject(HttpClient);
  public readonly usuario = signal<RespuestaSesion['usuario'] | null>(null);
  public iniciarSesion(nombreUsuario: string, contrasena: string) { return this.http.post<RespuestaSesion>(`${environment.urlApi}/autenticacion/iniciar-sesion`, { nombreUsuario, contrasena }).pipe(tap(({ usuario }) => { limpiarFiltrosSesion(); this.usuario.set(usuario); })); }
  public consultarSesion() { return this.http.get<RespuestaSesion>(`${environment.urlApi}/autenticacion/sesion`).pipe(tap(({ usuario }) => this.usuario.set(usuario))); }
  public cerrarSesion() { return this.http.post<void>(`${environment.urlApi}/autenticacion/cerrar-sesion`, {}).pipe(tap(() => { limpiarFiltrosSesion(); this.usuario.set(null); })); }
  public cambiarContrasena(contrasenaActual:string,nuevaContrasena:string,confirmarContrasena:string){return this.http.post<void>(`${environment.urlApi}/autenticacion/cambiar-contrasena`,{contrasenaActual,nuevaContrasena,confirmarContrasena}).pipe(tap(()=>this.usuario.update(u=>u?{...u,debeCambiarContrasena:false}:u)));}
  public limpiarSesion():void{this.usuario.set(null);}
}
