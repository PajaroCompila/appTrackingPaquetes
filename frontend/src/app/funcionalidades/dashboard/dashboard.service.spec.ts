import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DashboardService } from './dashboard.service';

describe('DashboardService', () => {
  it('envía fechas y tienda como parámetros', () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const servicio = TestBed.inject(DashboardService);
    const http = TestBed.inject(HttpTestingController);
    servicio.obtener({ fechaDesde: '2026-08-05', fechaHasta: '2026-08-05', codigoTienda: 'SPS' }).subscribe();
    const solicitud = http.expectOne((peticion) => peticion.url.endsWith('/api/dashboard/pedidos'));
    expect(solicitud.request.params.get('fechaDesde')).toBe('2026-08-05');
    expect(solicitud.request.params.get('fechaHasta')).toBe('2026-08-05');
    expect(solicitud.request.params.get('codigoTienda')).toBe('SPS');
    solicitud.flush({ fechaDesde: '2026-08-05', fechaHasta: '2026-08-05', totales: { pendientes: 0, validados: 0 }, porTienda: [], tiendas: [], consultadoEn: '2026-08-05T12:00:00-06:00' });
    http.verify();
  });

  it('envía sucursal y fechas al drilldown de vendedores', () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const servicio = TestBed.inject(DashboardService);
    const http = TestBed.inject(HttpTestingController);
    servicio.obtenerVentasPorVendedor('SPS', '2026-08-06', '2026-08-06').subscribe();
    const solicitud = http.expectOne((peticion) => peticion.url.endsWith('/api/dashboard/ventas-por-vendedor'));
    expect(solicitud.request.params.get('codigoSucursal')).toBe('SPS');
    expect(solicitud.request.params.get('fechaDesde')).toBe('2026-08-06');
    solicitud.flush({ codigoSucursal: 'SPS', codigoTienda: 'TSPS01', nombreSucursal: 'SPS',
      fechaDesde: '2026-08-06', fechaHasta: '2026-08-06',
      totales: { ventasValidadas: 0, vendedoresConVentas: 0, promedioVentasPorVendedor: 0 },
      porVendedor: [], consultadoEn: '2026-08-06T12:00:00Z' });
    http.verify();
  });
});
