import { TestBed } from '@angular/core/testing';
import { FiltrosGlobalesService } from './filtros-globales.service';

describe('FiltrosGlobalesService', () => {
  beforeEach(() => {
    sessionStorage.clear();
    TestBed.resetTestingModule();
  });

  it('comparte fechas y varios almacenes durante la sesión', () => {
    const servicio = TestBed.inject(FiltrosGlobalesService);
    servicio.actualizar({
      fechaDesde: '2026-09-01',
      fechaHasta: '2026-09-03',
      codigosAlmacen: ['BSPS03', 'TSPS01'],
    });

    expect(servicio.obtener()).toEqual({
      fechaDesde: '2026-09-01',
      fechaHasta: '2026-09-03',
      codigosAlmacen: ['BSPS03', 'TSPS01'],
    });
    expect(JSON.parse(sessionStorage.getItem('pedidosBodega.filtros.globales') ?? '{}'))
      .toMatchObject({ fechaDesde: '2026-09-01', codigosAlmacen: ['BSPS03', 'TSPS01'] });
  });

  it('restaura la selección al crear una pantalla nueva durante la misma sesión', () => {
    TestBed.inject(FiltrosGlobalesService).actualizar({
      fechaDesde: '2026-08-28',
      fechaHasta: '2026-08-31',
      codigosAlmacen: ['BSPS03'],
    });
    TestBed.resetTestingModule();

    expect(TestBed.inject(FiltrosGlobalesService).obtener()).toEqual({
      fechaDesde: '2026-08-28',
      fechaHasta: '2026-08-31',
      codigosAlmacen: ['BSPS03'],
    });
  });

  it('descarta una fecha inexistente guardada', () => {
    sessionStorage.setItem('pedidosBodega.filtros.globales', JSON.stringify({
      fechaDesde: '2026-02-29', fechaHasta: '2026-09-03', codigosAlmacen: [],
    }));
    TestBed.resetTestingModule();

    expect(TestBed.inject(FiltrosGlobalesService).obtener().fechaDesde)
      .not.toBe('2026-02-29');
  });

  it('reinicia los filtros comunes con el día actual de Honduras', () => {
    const servicio = TestBed.inject(FiltrosGlobalesService);
    servicio.actualizar({ fechaDesde: '2026-08-01', fechaHasta: '2026-08-02',
      codigosAlmacen: ['BSPS03'] });

    const filtros = servicio.reiniciar();

    expect(filtros.fechaDesde).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(filtros.fechaHasta).toBe(filtros.fechaDesde);
    expect(filtros.codigosAlmacen).toEqual([]);
  });
});
