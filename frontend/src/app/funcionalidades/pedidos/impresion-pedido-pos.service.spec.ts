import { TestBed } from '@angular/core/testing';
import { ImpresionPedidoPosService } from './impresion-pedido-pos.service';

describe('ImpresionPedidoPosService', () => {
  afterEach(() => {
    document.body.classList.remove('impresion-pedido-pos-activa');
    vi.restoreAllMocks();
  });

  it('prepara el único modelo POS con los mismos valores neutros del ticket maestro', () => {
    const servicio = TestBed.inject(ImpresionPedidoPosService);

    expect(servicio.preparar([{
      idPedido: 'R1:1', numeroPedido: ' 1001 ', codigo: ' A-1 ', descripcion: ' Artículo ',
      cantidad: 2, bodega: ' BSPS01 ', vendedor: ' Vendedor ', asignadoA: ' Responsable ',
    }, {
      idPedido: 'R1:2', numeroPedido: null, codigo: null, descripcion: null,
      cantidad: null, bodega: null, vendedor: null, asignadoA: null,
    }])).toEqual([{
      idPedido: 'R1:1', numeroPedido: '1001', codigo: 'A-1', descripcion: 'Artículo',
      cantidad: 2, bodega: 'BSPS01', vendedor: 'Vendedor', asignadoA: 'Responsable',
    }, {
      idPedido: 'R1:2', numeroPedido: '—', codigo: '—', descripcion: '—',
      cantidad: null, bodega: '—', vendedor: 'Sin vendedor', asignadoA: 'Sin asignar',
    }]);
  });

  it('activa únicamente el ticket POS durante la impresión y limpia el estado al finalizar', () => {
    const servicio = TestBed.inject(ImpresionPedidoPosService);
    const imprimir = vi.spyOn(window, 'print').mockImplementation(() => undefined);

    servicio.imprimir();
    expect(document.body.classList.contains('impresion-pedido-pos-activa')).toBe(true);
    expect(imprimir).toHaveBeenCalledOnce();

    servicio.finalizar();
    expect(document.body.classList.contains('impresion-pedido-pos-activa')).toBe(false);
  });
});
