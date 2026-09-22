import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
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
        error: (error: unknown) => this.error.set(this.mensajeError(error)),
      });
  }

  private mensajeError(error: unknown): string {
    if (!(error instanceof HttpErrorResponse)) return 'No fue posible iniciar sesión.';
    if (error.status === 0) return 'No fue posible conectar con el servidor. Verificá que los servicios estén activos.';
    const codigo = typeof error.error?.codigo === 'string' ? error.error.codigo : '';
    if (error.status === 429) {
      return codigo === 'USUARIO_BLOQUEADO'
        ? 'El usuario está bloqueado temporalmente. Intentá nuevamente más tarde.'
        : 'Se realizaron demasiados intentos. Intentá nuevamente más tarde.';
    }
    if (error.status === 400) return 'Revisá los datos de acceso e intentá nuevamente.';
    if (error.status >= 500) return 'El servidor no pudo procesar el inicio de sesión. Intentá nuevamente.';
    return 'El usuario o la contraseña no son correctos.';
  }

  public alternarContrasena(): void { this.mostrarContrasena.update((valor) => !valor); }
}
