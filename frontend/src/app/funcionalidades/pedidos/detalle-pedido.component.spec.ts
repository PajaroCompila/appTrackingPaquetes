import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { of, throwError } from 'rxjs';
import { DetallePedidoComponent } from './detalle-pedido.component';
import { PedidosService } from './pedidos.service';

describe('DetallePedidoComponent', () => {
  let fixture: ComponentFixture<DetallePedidoComponent>;
  let pedidosService: { obtenerDetallePedido: ReturnType<typeof vi.fn> };
  let enrutador: {
    navigateByUrl: ReturnType<typeof vi.fn>;
    parseUrl: ReturnType<typeof vi.fn>;
  };

  async function configurar(respuesta: unknown, retorno = '/pedidos?pagina=2'): Promise<void> {
    pedidosService = { obtenerDetallePedido: vi.fn().mockReturnValue(respuesta) };
    enrutador = {
      navigateByUrl: vi.fn().mockResolvedValue(true),
      parseUrl: vi.fn((url: string) => ({
        root: {
          children: {
            primary: {
              segments: url.split('?')[0].split('/').filter(Boolean).map((path) => ({ path })),
            },
          },
        },
      })),
    };
    await TestBed.configureTestingModule({
      imports: [DetallePedidoComponent],
      providers: [
        { provide: PedidosService, useValue: pedidosService },
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of(convertToParamMap({ folioPedido: 'F1' })),
            snapshot: {
              queryParamMap: convertToParamMap({ retorno, codigoAlmacen: ['BSPS01', 'BSPS02'] }),
            },
          },
        },
        { provide: Router, useValue: enrutador },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(DetallePedidoComponent);
  }

  it('renderiza partidas, conserva null y regresa al listado previo', async () => {
    await configurar(of({
      datos: {
        cabecera: {
          folioPedido: 'F1', numeroPedido: '101468453', codigoVenta: null,
          codigoVendedor: 30, nombreVendedor: 'Vendedor original',
          codigosAlmacen: ['BSPS01'], nombresBodega: 'Bodega Principal SPS',
          fechaHoraPedido: '2026-07-30T12:55:00',
          codigoEstadoVenta: 'A', codigoSincronizacion: 'N',
        },
        partidas: [{
          numeroPartida: '1', codigoArticulo: 'A1', descripcionArticulo: 'Artículo',
          cantidadSolicitada: 2, codigoAlmacen: 'BSPS01', nombreAlmacen: null,
          codigoEstadoEntrega: 'A',
        }],
      },
    }));
    fixture.detectChanges();
    const texto = fixture.nativeElement.textContent as string;

    expect(texto).toContain('Artículo');
    expect(texto).toContain('No disponible');
    fixture.nativeElement.querySelector('.boton-regresar-detalle').click();
    expect(texto).toContain('Pedido #101468453');
    expect(texto).not.toContain('Folio F1');
    expect(enrutador.navigateByUrl).toHaveBeenCalledWith('/pedidos?pagina=2');
    expect(pedidosService.obtenerDetallePedido).toHaveBeenCalledWith('F1', ['BSPS01', 'BSPS02']);
  });

  it('muestra un pedido inexistente sin detalles técnicos', async () => {
    await configurar(throwError(() => new HttpErrorResponse({
      status: 404,
      error: { mensaje: 'SQL oculto', idSeguimiento: 'id-404' },
    })));
    fixture.detectChanges();
    const texto = fixture.nativeElement.textContent as string;

    expect(texto).toContain('Pedido no encontrado');
    expect(texto).toContain('id-404');
    expect(texto).not.toContain('SQL oculto');
  });

  it('rechaza una dirección de retorno que no corresponde al listado', async () => {
    await configurar(of({ datos: { cabecera: {}, partidas: [] } }), '/pedidos-despachados?pagina=4');
    fixture.detectChanges();
    fixture.componentInstance.regresar();

    expect(enrutador.navigateByUrl).toHaveBeenCalledWith('/pedidos');
  });
});
