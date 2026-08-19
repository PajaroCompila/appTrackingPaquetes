import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { PedidosService } from './pedidos.service';

describe('PedidosService', () => {
  let servicio: PedidosService;
  let controladorHttp: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    servicio = TestBed.inject(PedidosService);
    controladorHttp = TestBed.inject(HttpTestingController);
  });

  afterEach(() => controladorHttp.verify());

  it('construye parámetros y omite filtros vacíos', () => {
    servicio.obtenerPedidos({
      numeroPedido: '  101468453  ',
      fechaDesde: '',
      codigosAlmacen: ['BSPS01', 'BSPS02'],
      pagina: 2,
      cantidadPorPagina: 50,
    }).subscribe();

    const solicitud = controladorHttp.expectOne(
      (peticion) => peticion.url === 'http://localhost:3280/api/pedidos',
    );
    expect(solicitud.request.params.get('numeroPedido')).toBe('101468453');
    expect(solicitud.request.params.getAll('codigoAlmacen')).toEqual(['BSPS01', 'BSPS02']);
    expect(solicitud.request.params.get('pagina')).toBe('2');
    expect(solicitud.request.params.get('cantidadPorPagina')).toBe('50');
    expect(solicitud.request.params.has('fechaDesde')).toBe(false);
    solicitud.flush({ datos: [], paginacion: { pagina: 2, cantidadPorPagina: 50, cantidadDevuelta: 0, hayMas: false } });
  });

  it('codifica el folio y conserva el filtro al construir la URL del detalle', () => {
    servicio.obtenerDetallePedido('FOLIO/CON ESPACIO', ['BSPS01', 'BSPS02']).subscribe();

    const solicitud = controladorHttp.expectOne(
      (peticion) => peticion.url === 'http://localhost:3280/api/pedidos/FOLIO%2FCON%20ESPACIO',
    );
    expect(solicitud.request.method).toBe('GET');
    expect(solicitud.request.params.getAll('codigoAlmacen')).toEqual(['BSPS01', 'BSPS02']);
    solicitud.flush({ datos: { cabecera: {}, partidas: [] } });
  });

  it('consulta inventario por código real de artículo y almacén', () => {
    servicio.obtenerInventarioArticulo('ART/001', 'BSPS03').subscribe();

    const solicitud = controladorHttp.expectOne(
      (peticion) => peticion.url === 'http://localhost:3280/api/articulos/ART%2F001/inventario',
    );
    expect(solicitud.request.method).toBe('GET');
    expect(solicitud.request.params.get('codigoAlmacen')).toBe('BSPS03');
    expect(solicitud.request.params.has('descripcion')).toBe(false);
    solicitud.flush({
      codigoArticulo: 'ART/001', descripcion: 'Artículo', codigoAlmacen: 'BSPS03',
      nombreAlmacen: 'Bodega', existenciaFisica: 2.5,
      existencias: [
        { codigoAlmacen: 'BSPS03', nombreAlmacen: 'Bodega', existenciaFisica: 2.5 },
      ],
    });
  });

  it('envía únicamente identidades de líneas al transferir parcialmente', () => {
    const lineas = [
      { idOrigen: 'R1:F1', identificadorDetalle: '2' },
      { idOrigen: 'SAP:22', identificadorDetalle: '0' },
    ];
    servicio.despacharLineas(lineas).subscribe();

    const solicitud = controladorHttp.expectOne(
      'http://localhost:3280/api/pedidos-despachados',
    );
    expect(solicitud.request.method).toBe('POST');
    expect(solicitud.request.body).toEqual({ lineas });
    expect(solicitud.request.body).not.toHaveProperty('codigoArticulo');
    solicitud.flush({ datos: { transferidas: lineas, omitidas: [], rechazadas: [] } });
  });
});
