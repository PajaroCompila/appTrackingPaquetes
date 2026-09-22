import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { PedidosDespachadosComponent } from './pedidos-despachados.component';
import { FiltrosGlobalesService } from '../../compartido/filtros-globales.service';

const pedido = {
  idOrigen: 'R1:F1',
  numeroPedido: '100',
  estadoLocal: 'DESPACHADO',
  despachadoEn: '2026-08-03T12:00:00Z',
  usuarioDespacho: 'Sistemas',
  fechaHoraPedido: '2026-08-03T10:00:00Z',
  fechaEntradaCola: '2026-08-03T11:54:30Z',
  nombreVendedor: 'Vendedor',
  articulos: [
    { identificadorDetalle: '1', codigoArticulo: 'A1', descripcion: 'Artículo uno', cantidad: 1, codigoAlmacen: 'B1', usuarioAsignado: 'Jorge Lara' },
    { identificadorDetalle: '2', codigoArticulo: 'A2', descripcion: 'Artículo dos', cantidad: 2, codigoAlmacen: 'B2', usuarioAsignado: 'Ana Calix' },
  ],
};

function responderListados(
  http: HttpTestingController,
  normales: unknown[] = [],
  especiales: unknown[] = [],
) {
  const solicitudes = http.match((solicitud) => solicitud.url.endsWith('/pedidos-despachados'));
  expect(solicitudes).toHaveLength(2);
  const normal = solicitudes.find(({ request }) => request.params.get('clasificacion') === 'normal')!;
  const especial = solicitudes.find(({ request }) => request.params.get('clasificacion') === 'especial')!;
  normal.flush({ datos: normales, paginacion: { pagina: 1, cantidadPorPagina: 25,
    totalRegistros: normales.length, hayMas: false } });
  especial.flush({ datos: especiales, paginacion: { pagina: 1, cantidadPorPagina: 25,
    totalRegistros: especiales.length, hayMas: false } });
  return { normal, especial };
}

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
    responderListados(TestBed.inject(HttpTestingController), [pedido]);
    fixture.detectChanges();

    const texto = fixture.nativeElement.textContent as string;
    const pestanas = [...fixture.nativeElement.querySelectorAll('.pestanas-vistas button')]
      .map((elemento: HTMLButtonElement) => ({
        texto: elemento.textContent?.trim(), activa: elemento.getAttribute('aria-selected'),
      }));
    const enlaces = [...fixture.nativeElement.querySelectorAll('.enlace-detalle')] as HTMLAnchorElement[];
    expect(texto).not.toContain('CREADO EN R1');
    expect(texto).toContain('Jorge Lara');
    expect(texto).toContain('Ana Calix');
    expect(pestanas).toEqual([
      { texto: 'Artículos', activa: 'true' },
      { texto: 'Pedido', activa: 'false' },
    ]);
    expect(enlaces).toHaveLength(2);
    expect(enlaces[0].getAttribute('href')).toBe(enlaces[1].getAttribute('href'));
    expect(texto).toContain('05:30');
    expect(texto).not.toContain('Imprimir');
  });

  it('calcula el tiempo congelado de un pedido especial con la misma regla', () => {
    configurar(null);
    const fixture = TestBed.createComponent(PedidosDespachadosComponent);
    fixture.detectChanges();
    responderListados(TestBed.inject(HttpTestingController), [], [{ ...pedido, esEspecial: true }]);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.tiempo-total-despacho').textContent).toContain('05:30');
  });

  it('muestra ambas secciones y mantiene su paginación independiente', () => {
    configurar(null);
    const fixture = TestBed.createComponent(PedidosDespachadosComponent);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    responderListados(http, [pedido], [{ ...pedido, idOrigen: 'R1:E1', numeroPedido: '200',
      esEspecial: true }]);
    fixture.detectChanges();

    const titulos = [...fixture.nativeElement.querySelectorAll('.grupo-listado-pedidos > h2')]
      .map((titulo: HTMLElement) => titulo.textContent?.trim());
    expect(titulos).toEqual(['Pedidos Normales', 'Pedidos Especiales']);

    fixture.componentInstance.irPagina('especiales', 2);
    const solicitudes = http.match((solicitud) => solicitud.url.endsWith('/pedidos-despachados'));
    expect(solicitudes.find(({ request }) => request.params.get('clasificacion') === 'normal')
      ?.request.params.get('pagina')).toBe('1');
    expect(solicitudes.find(({ request }) => request.params.get('clasificacion') === 'especial')
      ?.request.params.get('pagina')).toBe('2');
    solicitudes.forEach((solicitud) => solicitud.flush({ datos: [], paginacion: {
      pagina: Number(solicitud.request.params.get('pagina')), cantidadPorPagina: 25,
      totalRegistros: 0, hayMas: false,
    } }));
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
    const inicial = responderListados(http).normal;
    expect(inicial.request.params.get('fechaDesde')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    http.expectOne((solicitud) => solicitud.url.endsWith('/almacenes')).flush({ datos: [] });
    const componente = fixture.componentInstance;
    componente.filtros.numeroPedido = '101469987';
    componente.filtros.fechaDesde = '2026-08-15';
    componente.filtros.fechaHasta = '2026-08-19';
    componente.alternarAlmacen('BSPS01', true);
    http.expectNone((solicitud) => solicitud.url.endsWith('/pedidos-despachados'));
    componente.alternarAlmacen('BSPS02', true);
    http.expectNone((solicitud) => solicitud.url.endsWith('/pedidos-despachados'));
    expect(TestBed.inject(FiltrosGlobalesService).obtener().codigosAlmacen).toEqual(['BSPS01', 'BSPS02']);
    componente.buscar();
    const filtrada = responderListados(http).normal;
    expect(filtrada.request.params.get('numeroPedido')).toBe('101469987');
    expect(filtrada.request.params.getAll('codigoAlmacen')).toEqual(['BSPS01', 'BSPS02']);
    expect(filtrada.request.params.get('fechaDesde')).toBe('2026-08-15');
    expect(filtrada.request.params.get('fechaHasta')).toBe('2026-08-19');
    fixture.destroy();
  });

  it('muestra los almacenes seleccionados como chips y permite quitarlos', () => {
    configurar(null);
    const fixture = TestBed.createComponent(PedidosDespachadosComponent);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    responderListados(http);
    http.expectOne((solicitud) => solicitud.url.endsWith('/almacenes')).flush({ datos: [
      { codigoAlmacen: 'BSPS03', nombreAlmacen: 'Bodega 3', codigoSucursal: 'SPS', nombreSucursal: 'San Pedro Sula' },
      { codigoAlmacen: 'BSPS04', nombreAlmacen: 'Bodega 4', codigoSucursal: 'SPS', nombreSucursal: 'San Pedro Sula' },
    ] });

    fixture.componentInstance.alternarAlmacen('BSPS03', true);
    fixture.componentInstance.alternarAlmacen('BSPS04', true);
    http.expectNone((solicitud) => solicitud.url.endsWith('/pedidos-despachados'));
    fixture.detectChanges();

    const chips = [...fixture.nativeElement.querySelectorAll('.etiqueta-almacen')]
      .map((elemento: HTMLElement) => elemento.textContent?.trim());
    expect(chips).toEqual(expect.arrayContaining([expect.stringContaining('BSPS03'), expect.stringContaining('BSPS04')]));

    (fixture.nativeElement.querySelector('[aria-label="Quitar Bodega 3"]') as HTMLButtonElement).click();
    http.expectNone((solicitud) => solicitud.url.endsWith('/pedidos-despachados'));
    expect(TestBed.inject(FiltrosGlobalesService).obtener().codigosAlmacen).toEqual(['BSPS04']);
    fixture.componentInstance.buscar();
    const sinBodegaTres = responderListados(http).normal;
    expect(sinBodegaTres.request.params.getAll('codigoAlmacen')).toEqual(['BSPS04']);
    fixture.detectChanges();
    expect(fixture.componentInstance.filtros.codigosAlmacen).toEqual(['BSPS04']);
    expect(fixture.nativeElement.textContent).not.toContain('BSPS03 ×');
    fixture.destroy();
  });

  it('conserva la tabla visible durante Buscar sin cambiar el bloqueo de carga', () => {
    configurar(null);
    const fixture = TestBed.createComponent(PedidosDespachadosComponent);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    responderListados(http, [pedido]);
    http.expectOne((solicitud) => solicitud.url.endsWith('/almacenes')).flush({ datos: [] });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('tbody tr')).toHaveLength(2);
    fixture.componentInstance.buscar();
    fixture.detectChanges();
    expect(fixture.componentInstance.cargando()).toBe(true);
    expect(fixture.nativeElement.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(fixture.nativeElement.querySelector('button[type=submit]').disabled).toBe(true);
    responderListados(http, [pedido]);
    fixture.destroy();
  });
});
