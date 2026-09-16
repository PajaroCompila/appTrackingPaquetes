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
    expect(fixture.componentInstance.detalleVisual()?.articulos[0]?.responsable)
      .toBe('Sin asignar');
    fixture.nativeElement.querySelector('.boton-regresar-detalle').click();
    expect(texto).toContain('Pedido #101468453');
    expect(texto).not.toContain('Folio F1');
    expect(texto).not.toContain('Código de estado');
    expect(texto).not.toContain('Estado de sincronización');
    expect(texto).not.toContain('Solo consulta');
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

  it('sustituye en segundo plano las partidas modificadas por las vigentes', async () => {
    vi.useFakeTimers();
    const respuesta = (codigoArticulo: string, numeroPartida: string) => of({
      datos: {
        cabecera: {
          idOrigen: 'R1:TSPS01:F1', folioPedido: 'F1', numeroPedido: '101',
          codigoVenta: null, codigoVendedor: 1, nombreVendedor: 'Vendedor',
          codigosAlmacen: ['TSPS01'], nombresBodega: 'Tienda Principal',
          fechaHoraPedido: '2026-09-14T10:00:00', codigoEstadoVenta: 'A',
          codigoSincronizacion: null, origenPedido: 'R1' as const, creadoEnR1: true,
          sapDocEntry: null, articulos: [],
        },
        partidas: [{
          numeroPartida, codigoArticulo, descripcionArticulo: codigoArticulo,
          cantidadSolicitada: 1, codigoAlmacen: 'TSPS01',
          nombreAlmacen: 'Tienda Principal', codigoEstadoEntrega: 'A',
        }],
      },
    });
    try {
      await configurar(respuesta('ART-ANTERIOR', '1'));
      pedidosService.obtenerDetallePedido
        .mockReturnValueOnce(respuesta('ART-ANTERIOR', '1'))
        .mockReturnValue(respuesta('ART-NUEVO', '2'));
      fixture.detectChanges();
      expect(fixture.componentInstance.detalleVisual()?.articulos.map(({ codigo }) => codigo))
        .toEqual(['ART-ANTERIOR']);

      await vi.advanceTimersByTimeAsync(5000);
      fixture.detectChanges();

      expect(fixture.componentInstance.detalleVisual()?.articulos.map(({ codigo }) => codigo))
        .toEqual(['ART-NUEVO']);
    } finally {
      fixture.destroy();
      vi.useRealTimers();
    }
  });
});
