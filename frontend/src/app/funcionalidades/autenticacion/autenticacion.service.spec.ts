import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AutenticacionService } from './autenticacion.service';

describe('AutenticacionService', () => {
  it('inicia sesiÃ³n sin almacenar el token en el navegador', () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const servicio = TestBed.inject(AutenticacionService);
    const http = TestBed.inject(HttpTestingController);
    sessionStorage.setItem('pedidosBodega.filtros.pedidos', '{"fechaDesde":"2026-08-15"}');
    servicio.iniciarSesion('operador', 'secreto').subscribe();
    const solicitud = http.expectOne((peticion) => peticion.url.endsWith('/autenticacion/iniciar-sesion'));
    expect(solicitud.request.body).toEqual({ nombreUsuario: 'operador', contrasena: 'secreto' });
    solicitud.flush({ usuario: { usuarioId: '1', nombreUsuario: 'operador', nombreVisible: 'Operador', codigoRol: null, codigoAlmacen: null } });
    expect(servicio.usuario()?.nombreVisible).toBe('Operador');
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(1);
    expect(JSON.parse(sessionStorage.getItem('pedidosBodega.filtros.globales') ?? '{}'))
      .toMatchObject({ codigosAlmacen: [] });
  });
});
