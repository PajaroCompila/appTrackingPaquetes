import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';
import { AutenticacionService } from './autenticacion.service';

@Component({ selector: 'app-cambiar-contrasena', imports: [FormsModule],
  template: `<main class="pagina"><div class="encabezado-pagina"><div><p class="sobrelinea">Seguridad</p><h1>Cambiar contraseña</h1><p>Debés establecer una contraseña personal antes de continuar.</p></div></div><form class="panel formulario" (ngSubmit)="guardar()"><div class="campo"><label for="actual">Contraseña actual</label><input id="actual" name="actual" type="password" maxlength="128" required [(ngModel)]="actual"></div><div class="campo"><label for="nueva">Nueva contraseña</label><input id="nueva" name="nueva" type="password" minlength="10" maxlength="128" required [(ngModel)]="nueva"><small>Entre 10 y 128 caracteres; diferente del usuario.</small></div><div class="campo"><label for="confirmar">Confirmar contraseña</label><input id="confirmar" name="confirmar" type="password" minlength="10" maxlength="128" required [(ngModel)]="confirmar"></div>@if(error()){<p class="texto-error" role="alert">{{error()}}</p>}<button class="boton boton-primario" [disabled]="procesando()||nueva!==confirmar">Guardar contraseña</button></form></main>`,
  styles: [`.formulario{display:grid;max-width:34rem;gap:1rem;margin-top:1.5rem}.campo small{color:var(--gris-600)}`] })
export class CambiarContrasenaComponent {
  private readonly servicio=inject(AutenticacionService); private readonly router=inject(Router);
  public actual=''; public nueva=''; public confirmar=''; public readonly procesando=signal(false); public readonly error=signal('');
  public guardar():void{if(this.procesando())return;this.procesando.set(true);this.error.set('');
    this.servicio.cambiarContrasena(this.actual,this.nueva,this.confirmar).pipe(finalize(()=>this.procesando.set(false)))
      .subscribe({next:()=>void this.router.navigateByUrl('/pedidos'),error:()=>this.error.set('No pudimos cambiar la contraseña. Revisá los datos.')});}
}
