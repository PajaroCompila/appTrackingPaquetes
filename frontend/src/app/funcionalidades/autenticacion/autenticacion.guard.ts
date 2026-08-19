import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { AutenticacionService } from './autenticacion.service';

const destino = (servicio:AutenticacionService,router:Router,permitirCambio=false) => {
  const usuario=servicio.usuario();
  if(!usuario)return null;
  if(usuario.debeCambiarContrasena&&!permitirCambio)return router.createUrlTree(['/cambiar-contrasena']);
  return true;
};
export const sesionGuard=()=>{const s=inject(AutenticacionService),r=inject(Router);const d=destino(s,r,true);
  return d??s.consultarSesion().pipe(map(()=>destino(s,r,true)??true),catchError(()=>of(r.createUrlTree(['/login']))));};
export const autenticacionGuard=()=>{const s=inject(AutenticacionService),r=inject(Router);const d=destino(s,r);
  return d??s.consultarSesion().pipe(map(()=>destino(s,r)??true),catchError(()=>of(r.createUrlTree(['/login']))));};
export const administradorGuard=()=>{const s=inject(AutenticacionService),r=inject(Router);
  const validar=()=>s.usuario()?.codigoRol==='ADMINISTRADOR'?true:r.createUrlTree(['/pedidos']);
  return s.usuario()?validar():s.consultarSesion().pipe(map(validar),catchError(()=>of(r.createUrlTree(['/login']))));};
