import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';
import { AutenticacionService } from './autenticacion.service';

@Component({ selector: 'app-login', imports: [FormsModule], templateUrl: './login.component.html', styleUrl: './login.component.css', changeDetection: ChangeDetectionStrategy.OnPush })
export class LoginComponent {
  private readonly autenticacion = inject(AutenticacionService);
  private readonly router = inject(Router);
  public nombreUsuario = '';
  public contrasena = '';
  public readonly procesando = signal(false);
  public readonly error = signal('');
  public readonly mostrarContrasena = signal(false);

  public ingresar(): void {
    if (this.procesando()) return;
    this.procesando.set(true);
    this.error.set('');
    this.autenticacion.iniciarSesion(this.nombreUsuario, this.contrasena)
      .pipe(finalize(() => this.procesando.set(false)))
      .subscribe({
        next: ({ usuario }) => void this.router.navigateByUrl(
          usuario.debeCambiarContrasena ? '/cambiar-contrasena' : '/pedidos'),
        error: () => this.error.set('El usuario o la contraseña no son correctos.'),
      });
  }
  public alternarContrasena(): void { this.mostrarContrasena.update((valor) => !valor); }
}
