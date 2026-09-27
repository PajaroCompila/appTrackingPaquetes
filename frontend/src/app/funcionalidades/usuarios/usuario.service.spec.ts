import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { UsuarioService } from './usuario.service';

describe('cambio de rol', () => {
  it('envía solamente los campos editables aunque reciba el formulario completo', () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const servicio = TestBed.inject(UsuarioService);
    const http = TestBed.inject(HttpTestingController);
    const formulario = { nombreCompleto: 'Marketing', nombreUsuario: 'mkt1', correo: '',
      codigoRol: 'DASHBOARDS' as const, contrasena: '', confirmarContrasena: '', activo: true };
    servicio.editar('123', formulario).subscribe();
    const solicitud = http.expectOne(r => r.url.endsWith('/usuarios/123'));
    expect(solicitud.request.method).toBe('PATCH');
    expect(solicitud.request.body).toEqual({ nombreCompleto: 'Marketing', nombreUsuario: 'mkt1',
      correo: '', codigoRol: 'DASHBOARDS' });
    solicitud.flush({ datos: {} });
    http.verify();
  });
});
