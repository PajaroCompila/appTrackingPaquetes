import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { FiltrosGlobalesService } from '../../compartido/filtros-globales.service';
import { AlmacenesService } from '../pedidos/almacenes.service';
import { PedidosService } from '../pedidos/pedidos.service';
import { HistorialComponent } from './historial.component';
import { HistorialService } from './historial.service';
import { ImpresionesService } from '../../compartido/impresiones/impresiones.service';
import { DetallePedidoVistaComponent } from '../../compartido/detalle-pedido/detalle-pedido-vista.component';

describe('HistorialComponent', () => {
  it('imprime el detalle de historial con el mismo componente POS', async () => {
    vi.useFakeTimers();
    const imprimir = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    const detallePedido = {
      idOrigen: 'R1:H1', origenPedido: 'R1', creadoEnR1: true, sapDocEntry: null,
      folioPedido: '300', numeroPedido: '300', codigoVenta: null, codigoVendedor: 1,
      nombreVendedor: 'Vendedor historial', codigosAlmacen: ['BSPS01'], nombresBodega: 'Principal',
      fechaHoraPedido: '2026-09-22T08:00:00-06:00', codigoEstadoVenta: 'C',
      codigoSincronizacion: 'N', estadoLocal: 'VALIDADO', despachadoEn: '2026-09-22T09:00:00-06:00',
      validadoDetectadoEn: '2026-09-22T10:00:00-06:00', usuarioDespacho: 'Gregorio Cruz',
      articulos: [{ identificadorDetalle: '1', codigoArticulo: 'A-H1', descripcion: 'Artículo historial',
        cantidad: 1, codigoAlmacen: 'BSPS01', nombreAlmacen: 'Principal', usuarioAsignado: 'Gregorio Cruz' }],
    };
    await TestBed.configureTestingModule({
      imports: [HistorialComponent],
      providers: [
        { provide: HistorialService, useValue: { obtener: () => of({ datos: detallePedido }) } },
        { provide: AlmacenesService, useValue: { obtenerAlmacenes: () => of({ datos: [] }) } },
        { provide: PedidosService, useValue: { obtenerInventarioArticulo: vi.fn() } },
        { provide: ImpresionesService, useValue: { consultar: () => of({ datos: [] }), registrar: vi.fn() } },
        { provide: ActivatedRoute, useValue: { snapshot: {
          paramMap: convertToParamMap({ idOrigen: 'R1:H1' }), queryParamMap: convertToParamMap({}),
        } } },
        { provide: Router, useValue: { navigate: vi.fn(), navigateByUrl: vi.fn() } },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(HistorialComponent);
    fixture.detectChanges();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('app-vista-impresion-pedido')).toHaveLength(1);
    const detalle = fixture.debugElement.query(By.directive(DetallePedidoVistaComponent))
      .componentInstance as DetallePedidoVistaComponent;
    detalle.seleccionarTodos();
    detalle.imprimirSeleccionados();
    await vi.advanceTimersByTimeAsync(0);

    expect(detalle.articulosImpresion().map(({ numeroPedido, vendedor, asignadoA }) =>
      ({ numeroPedido, vendedor, asignadoA }))).toEqual([{
      numeroPedido: '300', vendedor: 'Vendedor historial', asignadoA: 'Gregorio Cruz',
    }]);
    expect(imprimir).toHaveBeenCalledOnce();
    fixture.destroy();
    imprimir.mockRestore();
    vi.useRealTimers();
  });

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
    const pestanas = [...fixture.nativeElement.querySelectorAll('.pestanas-vistas button')]
      .map((elemento: HTMLButtonElement) => ({
        texto: elemento.textContent?.trim(),
        activa: elemento.getAttribute('aria-selected'),
      }));
    expect(pestanas).toEqual([
      { texto: 'Artículos', activa: 'true' },
      { texto: 'Pedido', activa: 'false' },
    ]);
    expect(fixture.nativeElement.textContent).toContain('Imprimir seleccionados (0)');
    const consultasIniciales = buscar.mock.calls.length;
    componente.alternarAlmacen('BSPS03', true);
    expect(buscar.mock.calls.length).toBe(consultasIniciales);
    componente.alternarAlmacen('BSPS04', true);
    expect(componente.filtros.codigosAlmacen).toEqual(['BSPS03', 'BSPS04']);
    expect(buscar.mock.calls.length).toBe(consultasIniciales);
    expect(TestBed.inject(FiltrosGlobalesService).obtener().codigosAlmacen).toEqual(['BSPS03', 'BSPS04']);
    componente.buscar();
    expect(buscar).toHaveBeenLastCalledWith(expect.objectContaining({
      codigosAlmacen: ['BSPS03', 'BSPS04'],
    }));
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
    expect(buscar.mock.calls.length).toBe(consultasIniciales + 2);
    componente.buscar();
    expect(buscar).toHaveBeenLastCalledWith(expect.objectContaining({ codigosAlmacen: ['BSPS03'] }));
    fixture.destroy();
    vi.useRealTimers();
  });

  it('separa normales y especiales con páginas independientes', async () => {
    sessionStorage.clear();
    vi.useFakeTimers();
    const buscarArticulos = vi.fn((filtros: { clasificacion?: string; pagina: number }) => of({
      datos: [{
        idOrigen: filtros.clasificacion === 'especial' ? 'R1:E1' : 'R1:N1',
        identificadorDetalle: '1', numeroPedido: filtros.clasificacion === 'especial' ? '200' : '100',
        codigoArticulo: filtros.clasificacion === 'especial' ? 'ESPECIAL' : 'NORMAL',
        descripcion: 'Artículo', cantidad: 1, codigoAlmacen: 'BSPS01', nombreAlmacen: 'Bodega',
        fechaHoraPedido: '2026-09-14T10:00:00', fechaEntradaCola: '2026-09-14T10:04:00.000Z',
        despachadoEn: '2026-09-14T10:20:00.000Z', nombreVendedor: 'Vendedor',
        esEspecial: filtros.clasificacion === 'especial',
      }],
      paginacion: { pagina: filtros.pagina, cantidadPorPagina: 25,
        cantidadDevuelta: 1, totalRegistros: 50, hayMas: true },
    }));
    const obtenerInventarioArticulo = vi.fn().mockReturnValue(of({
      codigoArticulo: 'NORMAL', descripcion: 'Artículo', codigoAlmacen: 'BSPS01',
      nombreAlmacen: 'Bodega', existenciaFisica: 1, existencias: [],
    }));
    await TestBed.configureTestingModule({
      imports: [HistorialComponent],
      providers: [
        { provide: HistorialService, useValue: { buscar: vi.fn(), buscarArticulos,
          obtener: vi.fn() } },
        { provide: AlmacenesService, useValue: { obtenerAlmacenes: vi.fn()
          .mockReturnValue(of({ datos: [] })) } },
        { provide: PedidosService, useValue: { obtenerInventarioArticulo } },
        { provide: ActivatedRoute, useValue: { snapshot: {
          paramMap: convertToParamMap({}), queryParamMap: convertToParamMap({}),
        } } },
        { provide: Router, useValue: { navigate: vi.fn().mockResolvedValue(true),
          navigateByUrl: vi.fn() } },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(HistorialComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const imprimir = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    fixture.componentInstance.seleccionarTodasImpresiones('normales');
    fixture.componentInstance.seleccionarTodasImpresiones('especiales');
    fixture.componentInstance.imprimirSeleccionados();
    await vi.advanceTimersByTimeAsync(0);

    const titulos = [...fixture.nativeElement.querySelectorAll('.grupo-listado-pedidos > h2')]
      .map((titulo: HTMLElement) => titulo.textContent?.trim());
    expect(titulos).toEqual(['Pedidos Normales', 'Pedidos Especiales']);
    expect(fixture.nativeElement.textContent).toContain('IMPRIMIR TODO');
    expect(fixture.componentInstance.lineasSeleccionadasImpresion().size).toBe(2);
    expect(fixture.componentInstance.articulosImpresion().map(({ asignadoA }) => asignadoA))
      .toEqual(['Sin asignar', 'Sin asignar']);
    expect(imprimir).toHaveBeenCalledOnce();
    expect(fixture.nativeElement.textContent).toContain('NORMAL');
    expect(fixture.nativeElement.textContent).toContain('ESPECIAL');
    (fixture.nativeElement.querySelector('.codigo-articulo') as HTMLElement).click();
    expect(obtenerInventarioArticulo).toHaveBeenCalledWith('NORMAL', 'BSPS01');
    const tiempos = [...fixture.nativeElement.querySelectorAll('.tiempo-total-despacho')]
      .map((elemento: HTMLElement) => elemento.textContent?.trim());
    expect(tiempos).toEqual(['16:00', '16:00']);

    fixture.componentInstance.irPagina('especiales', 2);
    expect(buscarArticulos).toHaveBeenCalledWith(expect.objectContaining({
      clasificacion: 'normal', pagina: 1,
    }));
    expect(buscarArticulos).toHaveBeenCalledWith(expect.objectContaining({
      clasificacion: 'especial', pagina: 2,
    }));
    fixture.destroy();
    imprimir.mockRestore();
    vi.useRealTimers();
  });
});
