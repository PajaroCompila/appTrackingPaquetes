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
        { provide: Router, useValue: { url: '/pedidos-despachados?pagina=2&cantidadPorPagina=25', navigateByUrl: vi.fn() } },
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
});
