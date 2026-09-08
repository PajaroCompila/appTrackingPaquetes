import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ImpresionesService } from './impresiones.service';

describe('ImpresionesService', () => {
  beforeEach(() => TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting()],
  }));

  it('consulta y registra impresiones con la identidad estable del artículo', () => {
    const servicio = TestBed.inject(ImpresionesService);
    const http = TestBed.inject(HttpTestingController);
    const lineas = [{ idOrigen: 'R1:F1', identificadorDetalle: '2' }];

    servicio.consultar(lineas).subscribe();
    const consulta = http.expectOne((solicitud) => solicitud.url.endsWith('/api/impresiones/consultar'));
    expect(consulta.request.method).toBe('POST');
    expect(consulta.request.body).toEqual({ lineas });
    consulta.flush({ datos: [] });

    servicio.registrar(lineas).subscribe();
    const registro = http.expectOne((solicitud) => solicitud.url.endsWith('/api/impresiones/registrar'));
    expect(registro.request.method).toBe('POST');
    expect(registro.request.body).toEqual({ lineas });
    registro.flush({ datos: [{ ...lineas[0], cantidadImpresiones: 1,
      ultimaImpresionEn: '2026-09-07T21:00:00.000Z' }] });
    http.verify();
  });
});
