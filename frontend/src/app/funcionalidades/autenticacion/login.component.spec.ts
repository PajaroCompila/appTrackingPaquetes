import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { throwError } from 'rxjs';
import { vi } from 'vitest';
import { AutenticacionService } from './autenticacion.service';
import { LoginComponent } from './login.component';

describe('LoginComponent', () => {
  const iniciarSesion = vi.fn();

  beforeEach(() => {
    iniciarSesion.mockReset();
    TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [
        provideRouter([]),
        { provide: AutenticacionService, useValue: { iniciarSesion } },
      ],
    });
  });

  it.each([
    [0, null, 'No fue posible conectar con el servidor. Verificá que los servicios estén activos.'],
    [429, { codigo: 'USUARIO_BLOQUEADO' }, 'El usuario está bloqueado temporalmente. Intentá nuevamente más tarde.'],
    [429, { codigo: 'DEMASIADOS_INTENTOS' }, 'Se realizaron demasiados intentos. Intentá nuevamente más tarde.'],
    [500, { codigo: 'ERROR_INTERNO' }, 'El servidor no pudo procesar el inicio de sesión. Intentá nuevamente.'],
    [401, { codigo: 'CREDENCIALES_INVALIDAS' }, 'El usuario o la contraseña no son correctos.'],
  ])('muestra el diagnóstico correcto para HTTP %s', (status, error, mensaje) => {
    iniciarSesion.mockReturnValue(throwError(() => new HttpErrorResponse({ status, error })));
    const componente = TestBed.createComponent(LoginComponent).componentInstance;
    componente.nombreUsuario = 'operador';
    componente.contrasena = 'valor-de-prueba';

    componente.ingresar();

    expect(componente.error()).toBe(mensaje);
    expect(componente.procesando()).toBe(false);
  });
});
