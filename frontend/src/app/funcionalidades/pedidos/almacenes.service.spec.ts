import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AlmacenesService } from './almacenes.service';

describe('AlmacenesService', () => {
  it('carga el catálogo de almacenes', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const servicio = TestBed.inject(AlmacenesService);
    const controladorHttp = TestBed.inject(HttpTestingController);
    let cantidad = 0;

    servicio.obtenerAlmacenes().subscribe(({ datos }) => cantidad = datos.length);
    const solicitud = controladorHttp.expectOne('http://localhost:3280/api/almacenes');
    solicitud.flush({ datos: [{
      codigoAlmacen: 'BSPS01', nombreAlmacen: 'Bodega principal',
      codigoSucursal: 'SPS', nombreSucursal: 'San Pedro Sula_P',
    }] });

    expect(cantidad).toBe(1);
    controladorHttp.verify();
  });
});
