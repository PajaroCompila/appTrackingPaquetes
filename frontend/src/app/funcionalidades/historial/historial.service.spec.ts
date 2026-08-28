import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { HistorialService } from './historial.service';

describe('HistorialService', () => {
  it('envía número de pedido y almacén sin incluir sucursal', () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const servicio = TestBed.inject(HistorialService);
    const http = TestBed.inject(HttpTestingController);

    servicio.buscar({ fechaDesde: '2026-08-01', fechaHasta: '2026-08-10',
      numeroPedido: '0012345', codigosAlmacen: ['BSPS01', 'BTGU01'],
      pagina: 1, cantidadPorPagina: 25 }).subscribe();

    const solicitud = http.expectOne((peticion) => peticion.url.endsWith('/api/historial-validados'));
    expect(solicitud.request.params.get('numeroPedido')).toBe('0012345');
    expect(solicitud.request.params.getAll('codigoAlmacen')).toEqual(['BSPS01', 'BTGU01']);
    expect(solicitud.request.params.has('codigoSucursal')).toBe(false);
    solicitud.flush({ datos: [], paginacion: { pagina: 1, cantidadPorPagina: 25,
      cantidadDevuelta: 0, hayMas: false } });
    http.verify();
  });

  it('consulta partidas históricas con los mismos filtros y paginación por artículo', () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const servicio = TestBed.inject(HistorialService);
    const http = TestBed.inject(HttpTestingController);
    servicio.buscarArticulos({ fechaDesde: '2026-08-01', fechaHasta: '2026-08-28',
      numeroPedido: '101500100', codigosAlmacen: ['BSPS01'], pagina: 2,
      cantidadPorPagina: 25 }).subscribe();
    const solicitud = http.expectOne((peticion) =>
      peticion.url.endsWith('/api/historial-validados/articulos'));
    expect(solicitud.request.params.get('numeroPedido')).toBe('101500100');
    expect(solicitud.request.params.getAll('codigoAlmacen')).toEqual(['BSPS01']);
    expect(solicitud.request.params.get('pagina')).toBe('2');
    solicitud.flush({ datos: [], paginacion: { pagina: 2, cantidadPorPagina: 25,
      cantidadDevuelta: 0, hayMas: false } });
    http.verify();
  });
});
