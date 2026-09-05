import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { PedidosDespachadosComponent } from './pedidos-despachados.component';

const pedido = {
  idOrigen: 'R1:F1',
  numeroPedido: '100',
  estadoLocal: 'DESPACHADO',
  despachadoEn: '2026-08-03T12:00:00Z',
  usuarioDespacho: 'Sistemas',
  fechaHoraPedido: '2026-08-03T10:00:00Z',
  nombreVendedor: 'Vendedor',
  articulos: [
    { identificadorDetalle: '1', codigoArticulo: 'A1', descripcion: 'Artículo uno', cantidad: 1, codigoAlmacen: 'B1' },
    { identificadorDetalle: '2', codigoArticulo: 'A2', descripcion: 'Artículo dos', cantidad: 2, codigoAlmacen: 'B2' },
  ],
};

describe('PedidosDespachadosComponent', () => {
  function configurar(idOrigen: string | null, retorno: string | null = null): void {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      imports: [PedidosDespachadosComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap(idOrigen ? { idOrigen } : {}),
              queryParamMap: convertToParamMap(retorno ? { retorno } : {}),
            },
          },
        },
        { provide: Router, useValue: { url: '/pedidos-despachados?pagina=2&cantidadPorPagina=25', navigate: vi.fn().mockResolvedValue(true), navigateByUrl: vi.fn() } },
      ],
    });
  }

  it('oculta Creado en R1 y todas las filas del pedido usan la misma cabecera', () => {
    configurar(null);
    const fixture = TestBed.createComponent(PedidosDespachadosComponent);
    fixture.detectChanges();
    TestBed.inject(HttpTestingController).expectOne((solicitud) =>
      solicitud.url.endsWith('/pedidos-despachados'),
    ).flush({ datos: [pedido] });
    fixture.detectChanges();

    const texto = fixture.nativeElement.textContent as string;
    const enlaces = [...fixture.nativeElement.querySelectorAll('.enlace-detalle')] as HTMLAnchorElement[];
    expect(texto).not.toContain('CREADO EN R1');
    expect(enlaces).toHaveLength(2);
    expect(enlaces[0].getAttribute('href')).toBe(enlaces[1].getAttribute('href'));
  });

  it('consulta por idOrigen y muestra todas las líneas del pedido', () => {
    configurar('R1:F1', '/pedidos-despachados?pagina=2&cantidadPorPagina=25');
    const fixture = TestBed.createComponent(PedidosDespachadosComponent);
    fixture.detectChanges();
    TestBed.inject(HttpTestingController).expectOne((solicitud) =>
      solicitud.url.endsWith('/pedidos-despachados/R1%3AF1'),
    ).flush({ datos: pedido });
    fixture.detectChanges();

    const texto = fixture.nativeElement.textContent as string;
    expect(texto).toContain('Pedido #100');
    expect(texto).toContain('Artículo uno');
    expect(texto).toContain('Artículo dos');
    expect(texto).toContain('Sistemas');
  });

  it('regresa al listado conservando página y cantidad por página', () => {
    configurar('R1:F1', '/pedidos-despachados?pagina=2&cantidadPorPagina=25');
    const fixture = TestBed.createComponent(PedidosDespachadosComponent);
    fixture.componentInstance.regresar();
    expect(TestBed.inject(Router).navigateByUrl).toHaveBeenCalledWith(
      '/pedidos-despachados?pagina=2&cantidadPorPagina=25',
    );
  });

  it('muestra filtros y envía pedido, fechas, almacenes y paginación', () => {
    configurar(null);
    const fixture = TestBed.createComponent(PedidosDespachadosComponent);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    const inicial = http.expectOne((solicitud) => solicitud.url.endsWith('/pedidos-despachados'));
    expect(inicial.request.params.get('fechaDesde')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    inicial.flush({ datos: [], paginacion: { pagina: 1, cantidadPorPagina: 25, totalRegistros: 0, hayMas: false } });
    http.expectOne((solicitud) => solicitud.url.endsWith('/almacenes')).flush({ datos: [] });
    const componente = fixture.componentInstance;
    componente.filtros.numeroPedido = '101469987';
    componente.filtros.fechaDesde = '2026-08-15';
    componente.filtros.fechaHasta = '2026-08-19';
    componente.alternarAlmacen('BSPS01', true);
    const primerAlmacen = http.expectOne((solicitud) => solicitud.url.endsWith('/pedidos-despachados'));
    expect(primerAlmacen.request.params.getAll('codigoAlmacen')).toEqual(['BSPS01']);
    primerAlmacen.flush({ datos: [], paginacion: {
      pagina: 1, cantidadPorPagina: 25, totalRegistros: 0, hayMas: false,
    } });
    componente.alternarAlmacen('BSPS02', true);
    const filtrada = http.expectOne((solicitud) => solicitud.url.endsWith('/pedidos-despachados'));
    expect(filtrada.request.params.get('numeroPedido')).toBe('101469987');
    expect(filtrada.request.params.getAll('codigoAlmacen')).toEqual(['BSPS01', 'BSPS02']);
    expect(filtrada.request.params.get('fechaDesde')).toBe('2026-08-15');
    expect(filtrada.request.params.get('fechaHasta')).toBe('2026-08-19');
    filtrada.flush({ datos: [], paginacion: { pagina: 1, cantidadPorPagina: 25, totalRegistros: 0, hayMas: false } });
    fixture.destroy();
  });

  it('muestra los almacenes seleccionados como chips y permite quitarlos', () => {
    configurar(null);
    const fixture = TestBed.createComponent(PedidosDespachadosComponent);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne((solicitud) => solicitud.url.endsWith('/pedidos-despachados'))
      .flush({ datos: [], paginacion: { hayMas: false, totalRegistros: 0 } });
    http.expectOne((solicitud) => solicitud.url.endsWith('/almacenes')).flush({ datos: [
      { codigoAlmacen: 'BSPS03', nombreAlmacen: 'Bodega 3', codigoSucursal: 'SPS', nombreSucursal: 'San Pedro Sula' },
      { codigoAlmacen: 'BSPS04', nombreAlmacen: 'Bodega 4', codigoSucursal: 'SPS', nombreSucursal: 'San Pedro Sula' },
    ] });

    fixture.componentInstance.alternarAlmacen('BSPS03', true);
    http.expectOne((solicitud) => solicitud.url.endsWith('/pedidos-despachados'))
      .flush({ datos: [], paginacion: { hayMas: false, totalRegistros: 0 } });
    fixture.componentInstance.alternarAlmacen('BSPS04', true);
    http.expectOne((solicitud) => solicitud.url.endsWith('/pedidos-despachados'))
      .flush({ datos: [], paginacion: { hayMas: false, totalRegistros: 0 } });
    fixture.detectChanges();

    const chips = [...fixture.nativeElement.querySelectorAll('.etiqueta-almacen')]
      .map((elemento: HTMLElement) => elemento.textContent?.trim());
    expect(chips).toEqual(expect.arrayContaining([expect.stringContaining('BSPS03'), expect.stringContaining('BSPS04')]));

    (fixture.nativeElement.querySelector('[aria-label="Quitar Bodega 3"]') as HTMLButtonElement).click();
    const sinBodegaTres = http.expectOne((solicitud) => solicitud.url.endsWith('/pedidos-despachados'));
    expect(sinBodegaTres.request.params.getAll('codigoAlmacen')).toEqual(['BSPS04']);
    sinBodegaTres.flush({ datos: [], paginacion: { hayMas: false, totalRegistros: 0 } });
    fixture.detectChanges();
    expect(fixture.componentInstance.filtros.codigosAlmacen).toEqual(['BSPS04']);
    expect(fixture.nativeElement.textContent).not.toContain('BSPS03 ×');
    fixture.destroy();
  });
});
