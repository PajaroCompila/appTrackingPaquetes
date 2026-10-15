import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AutenticacionService } from './autenticacion.service';

describe('AutenticacionService', () => {
  let servicio: AutenticacionService;
  let http: HttpTestingController;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    servicio = TestBed.inject(AutenticacionService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    servicio.limpiarSesion();
    http.verify();
    sessionStorage.clear();
    localStorage.clear();
    vi.useRealTimers();
  });

  const responderInicioSesion = () => {
    const solicitud = http.expectOne((peticion) => peticion.url.endsWith('/autenticacion/iniciar-sesion'));
    solicitud.flush({
      usuario: {
        usuarioId: '1', nombreUsuario: 'operador', nombreVisible: 'Operador',
        codigoRol: null, codigoAlmacen: null,
      },
    });
  };

  it('inicia sesión sin almacenar el token en el navegador', () => {
    sessionStorage.setItem('pedidosBodega.filtros.pedidos', '{"fechaDesde":"2026-08-15"}');
    servicio.iniciarSesion('operador', 'secreto').subscribe();
    const solicitud = http.expectOne((peticion) => peticion.url.endsWith('/autenticacion/iniciar-sesion'));
    expect(solicitud.request.body).toEqual({ nombreUsuario: 'operador', contrasena: 'secreto' });
    solicitud.flush({
      usuario: {
        usuarioId: '1', nombreUsuario: 'operador', nombreVisible: 'Operador',
        codigoRol: null, codigoAlmacen: null,
      },
    });
    expect(servicio.usuario()?.nombreVisible).toBe('Operador');
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(1);
    expect(JSON.parse(sessionStorage.getItem('pedidosBodega.filtros.globales') ?? '{}'))
      .toMatchObject({ codigosAlmacen: [] });
  });

  it('mantiene viva una sesión activa cada cinco minutos', async () => {
    servicio.iniciarSesion('operador', 'secreto').subscribe();
    responderInicioSesion();

    await vi.advanceTimersByTimeAsync(5 * 60_000);

    const renovacion = http.expectOne((peticion) => peticion.url.endsWith('/autenticacion/sesion'));
    expect(renovacion.request.method).toBe('GET');
    renovacion.flush({
      usuario: {
        usuarioId: '1', nombreUsuario: 'operador', nombreVisible: 'Operador',
        codigoRol: null, codigoAlmacen: null,
      },
    });
  });

  it('detiene la renovación periódica al limpiar la sesión', async () => {
    servicio.iniciarSesion('operador', 'secreto').subscribe();
    responderInicioSesion();
    servicio.limpiarSesion();

    await vi.advanceTimersByTimeAsync(10 * 60_000);

    http.expectNone((peticion) => peticion.url.endsWith('/autenticacion/sesion'));
  });
});
