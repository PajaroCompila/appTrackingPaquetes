import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { Subject, of } from 'rxjs';
import { FiltrosGlobalesService } from '../../compartido/filtros-globales.service';
import { AlmacenesService } from '../pedidos/almacenes.service';
import { PedidosService } from '../pedidos/pedidos.service';
import { HistorialComponent } from './historial.component';
import { HistorialService } from './historial.service';

describe('HistorialComponent', () => {
  it('muestra chips desde el filtro real y sincroniza su eliminación', async () => {
    sessionStorage.clear();
    vi.useFakeTimers();
    const buscar = vi.fn().mockReturnValue(of({
      datos: [], paginacion: { pagina: 1, cantidadPorPagina: 25, cantidadDevuelta: 0, hayMas: false },
    }));
    await TestBed.configureTestingModule({
      imports: [HistorialComponent],
      providers: [
        { provide: HistorialService, useValue: { buscar, buscarArticulos: buscar, obtener: vi.fn() } },
        { provide: AlmacenesService, useValue: { obtenerAlmacenes: vi.fn().mockReturnValue(of({ datos: [
          { codigoAlmacen: 'BSPS03', nombreAlmacen: 'Bodega 3', codigoSucursal: 'SPS', nombreSucursal: 'San Pedro Sula' },
          { codigoAlmacen: 'BSPS04', nombreAlmacen: 'Bodega 4', codigoSucursal: 'SPS', nombreSucursal: 'San Pedro Sula' },
        ] })) } },
        { provide: PedidosService, useValue: { obtenerInventarioArticulo: vi.fn() } },
        { provide: ActivatedRoute, useValue: { snapshot: {
          paramMap: convertToParamMap({}), queryParamMap: convertToParamMap({}),
        } } },
        { provide: Router, useValue: { navigate: vi.fn().mockResolvedValue(true), navigateByUrl: vi.fn() } },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(HistorialComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    const componente = fixture.componentInstance;
    componente.alternarAlmacen('BSPS03', true);
    componente.alternarAlmacen('BSPS04', true);
    expect(componente.filtros.codigosAlmacen).toEqual(['BSPS03', 'BSPS04']);
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();

    const chips = [...fixture.nativeElement.querySelectorAll('.etiqueta-almacen')]
      .map((elemento: HTMLElement) => elemento.textContent?.trim());
    expect(chips).toEqual(expect.arrayContaining([expect.stringContaining('BSPS03'), expect.stringContaining('BSPS04')]));

    (fixture.nativeElement.querySelector('[aria-label="Quitar Bodega 4"]') as HTMLButtonElement).click();
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    expect(componente.filtros.codigosAlmacen).toEqual(['BSPS03']);
    expect(TestBed.inject(FiltrosGlobalesService).obtener().codigosAlmacen).toEqual(['BSPS03']);
    expect(buscar).toHaveBeenLastCalledWith(expect.objectContaining({ codigosAlmacen: ['BSPS03'] }));
    fixture.destroy();
    vi.useRealTimers();
  });

  it('ignora respuestas anteriores cuando cambia el almacén durante la carga', async () => {
    TestBed.resetTestingModule();
    sessionStorage.clear();
    vi.useFakeTimers();
    const primeraConsulta = new Subject<{
      datos: never[];
      paginacion: { pagina: number; cantidadPorPagina: number; cantidadDevuelta: number; hayMas: boolean };
    }>();
    const segundaConsulta = new Subject<{
      datos: [{
        idOrigen: string;
        origenPedido: 'R1';
        creadoEnR1: true;
        sapDocEntry: null;
        folioPedido: string;
        numeroPedido: string;
        codigoVenta: null;
        codigoVendedor: null;
        nombreVendedor: null;
        codigosAlmacen: string[];
        nombresBodega: null;
        fechaHoraPedido: string;
        codigoEstadoVenta: string;
        codigoSincronizacion: null;
        articulos: [{
          identificadorDetalle: string;
          codigoArticulo: string;
          descripcion: string;
          cantidad: number;
          codigoAlmacen: string;
          nombreAlmacen: string;
        }];
        estadoLocal: 'VALIDADO';
        despachadoEn: null;
        validadoDetectadoEn: null;
        usuarioDespacho: null;
      }];
      paginacion: { pagina: number; cantidadPorPagina: number; cantidadDevuelta: number; hayMas: boolean };
    }>();
    const buscar = vi.fn()
      .mockReturnValueOnce(primeraConsulta.asObservable())
      .mockReturnValueOnce(segundaConsulta.asObservable());
    await TestBed.configureTestingModule({
      imports: [HistorialComponent],
      providers: [
        { provide: HistorialService, useValue: { buscar, buscarArticulos: buscar, obtener: vi.fn() } },
        { provide: AlmacenesService, useValue: { obtenerAlmacenes: vi.fn().mockReturnValue(of({ datos: [] })) } },
        { provide: PedidosService, useValue: { obtenerInventarioArticulo: vi.fn() } },
        { provide: ActivatedRoute, useValue: { snapshot: {
          paramMap: convertToParamMap({}), queryParamMap: convertToParamMap({}),
        } } },
        { provide: Router, useValue: { navigate: vi.fn().mockResolvedValue(true), navigateByUrl: vi.fn() } },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(HistorialComponent);
    fixture.detectChanges();
    const componente = fixture.componentInstance;
    componente.alternarAlmacen('BSPS01', true);

    primeraConsulta.next({
      datos: [],
      paginacion: { pagina: 1, cantidadPorPagina: 25, cantidadDevuelta: 0, hayMas: false },
    });
    primeraConsulta.complete();
    await Promise.resolve();

    expect(buscar).toHaveBeenCalledTimes(2);
    expect(buscar).toHaveBeenLastCalledWith(expect.objectContaining({ codigosAlmacen: ['BSPS01'] }));
    segundaConsulta.next({
      datos: [{
        idOrigen: 'R1:F1',
        origenPedido: 'R1',
        creadoEnR1: true,
        sapDocEntry: null,
        folioPedido: 'F1',
        numeroPedido: '100',
        codigoVenta: null,
        codigoVendedor: null,
        nombreVendedor: null,
        codigosAlmacen: ['BSPS01'],
        nombresBodega: null,
        fechaHoraPedido: '2026-08-03T10:00:00',
        codigoEstadoVenta: 'C',
        codigoSincronizacion: null,
        articulos: [{
          identificadorDetalle: '1',
          codigoArticulo: 'A1',
          descripcion: 'Artículo filtrado',
          cantidad: 1,
          codigoAlmacen: 'BSPS01',
          nombreAlmacen: 'Bodega 1',
        }],
        estadoLocal: 'VALIDADO',
        despachadoEn: null,
        validadoDetectadoEn: null,
        usuarioDespacho: null,
      }],
      paginacion: { pagina: 1, cantidadPorPagina: 25, cantidadDevuelta: 1, hayMas: false },
    });
    segundaConsulta.complete();

    expect(componente.registros()[0]?.codigosAlmacen).toEqual(['BSPS01']);
    fixture.destroy();
    vi.useRealTimers();
  });
});
