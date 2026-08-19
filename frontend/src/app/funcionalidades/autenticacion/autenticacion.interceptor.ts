import { HttpErrorResponse, type HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AutenticacionService } from './autenticacion.service';
export const autenticacionInterceptor:HttpInterceptorFn=(solicitud,siguiente)=>{const servicio=inject(AutenticacionService),router=inject(Router);
  return siguiente(solicitud.clone({withCredentials:true})).pipe(catchError((error:unknown)=>{
    if(error instanceof HttpErrorResponse&&error.status===401&&!solicitud.url.endsWith('/iniciar-sesion')){
      servicio.limpiarSesion();void router.navigate(['/login'],{queryParams:{sesionFinalizada:true}});
    }return throwError(()=>error);}));};
