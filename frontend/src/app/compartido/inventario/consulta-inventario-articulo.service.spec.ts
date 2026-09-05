import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { PedidosService } from '../../funcionalidades/pedidos/pedidos.service';
import { ConsultaInventarioArticuloService } from './consulta-inventario-articulo.service';

describe('ConsultaInventarioArticuloService', () => {
  const obtenerInventarioArticulo = vi.fn();

  beforeEach(() => {
    obtenerInventarioArticulo.mockReset();
    TestBed.configureTestingModule({
      providers: [{ provide: PedidosService, useValue: { obtenerInventarioArticulo } }],
    });
  });

  it('mantiene cero como una existencia válida', () => {
    obtenerInventarioArticulo.mockReturnValue(of({
      codigoArticulo: 'ART-0', descripcion: 'Artículo sin existencias',
      codigoAlmacen: 'BSPS01', nombreAlmacen: 'Bodega principal',
      existenciaFisica: 0, existencias: [],
    }));
    const consulta = TestBed.inject(ConsultaInventarioArticuloService);

    consulta.abrir(' ART-0 ', ' BSPS01 ');

    expect(obtenerInventarioArticulo).toHaveBeenCalledWith('ART-0', 'BSPS01');
    expect(consulta.estado()).toBe('datos');
    expect(consulta.inventario()?.existenciaFisica).toBe(0);
    expect(consulta.abierto()).toBe(true);
  });

  it('distingue artículo no encontrado de un error de consulta', () => {
    const consulta = TestBed.inject(ConsultaInventarioArticuloService);
    obtenerInventarioArticulo.mockReturnValueOnce(throwError(() => ({ status: 404 })));
    consulta.abrir('NO-EXISTE', 'BSPS01');
    expect(consulta.estado()).toBe('no-encontrado');

    obtenerInventarioArticulo.mockReturnValueOnce(throwError(() => ({ status: 500 })));
    consulta.abrir('ERROR-SAP', 'BSPS02');
    expect(consulta.estado()).toBe('error');
  });

  it('no consulta cuando falta el código o el almacén', () => {
    const consulta = TestBed.inject(ConsultaInventarioArticuloService);
    consulta.abrir('ART-1', null);
    consulta.abrir(null, 'BSPS01');
    expect(obtenerInventarioArticulo).not.toHaveBeenCalled();
  });
});
