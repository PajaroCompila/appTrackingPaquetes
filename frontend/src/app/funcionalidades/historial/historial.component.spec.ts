import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { NEVER, of, throwError } from 'rxjs';
import { FiltrosGlobalesService } from '../../compartido/filtros-globales.service';
import { AlmacenesService } from '../pedidos/almacenes.service';
import { PedidosService } from '../pedidos/pedidos.service';
import { HistorialComponent } from './historial.component';
import { HistorialService } from './historial.service';
import type { HistorialValidado } from './historial.interface';
import { ImpresionesService } from '../../compartido/impresiones/impresiones.service';
import { DetallePedidoVistaComponent } from '../../compartido/detalle-pedido/detalle-pedido-vista.component';
import { AutenticacionService } from '../autenticacion/autenticacion.service';
import type { UsuarioSesion } from '../autenticacion/autenticacion.interface';

describe('HistorialComponent', () => {
  const usuario = signal<UsuarioSesion>({ usuarioId: '1', nombreUsuario: 'operador',
    nombreVisible: 'Operador', codigoRol: 'OPERADOR_BODEGA', codigoAlmacen: null,
    debeCambiarContrasena: false });

  beforeEach(() => {
    usuario.set({ ...usuario(), codigoRol: 'OPERADOR_BODEGA' });
    TestBed.configureTestingModule({
      providers: [{ provide: AutenticacionService, useValue: { usuario } }],
    });
  });

  it('DASHBOARDS ve el historial sin controles de impresion', async () => {
    usuario.set({ ...usuario(), codigoRol: 'DASHBOARDS' });
    const buscarArticulos = vi.fn().mockReturnValue(of({
      datos: [{ idOrigen: 'R1:H1', identificadorDetalle: '1', numeroPedido: '300',
        codigoArticulo: 'A1', descripcion: 'Articulo', cantidad: 1, codigoAlmacen: 'BSPS01',
        nombreAlmacen: 'Bodega', fechaHoraPedido: '2026-09-22T08:00:00-06:00',
        nombreVendedor: 'Vendedor', esEspecial: false, estadoHistorial: 'CERRADO' }],
      paginacion: { pagina: 1, cantidadPorPagina: 25, cantidadDevuelta: 1,
        totalRegistros: 1, hayMas: false },
    }));
    await TestBed.configureTestingModule({
      imports: [HistorialComponent],
      providers: [
        { provide: HistorialService, useValue: { buscar: vi.fn(), buscarArticulos, obtener: vi.fn() } },
        { provide: AlmacenesService, useValue: { obtenerAlmacenes: () => of({ datos: [] }) } },
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
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.acciones-impresion-grupo')).toBeNull();
    expect(fixture.nativeElement.querySelector('.columna-imprimir')).toBeNull();
    expect(fixture.nativeElement.querySelector('.etiqueta-estado-cerrado')?.textContent).toContain('CERRADO');
    fixture.componentInstance.seleccionarTodasImpresiones('normales');
    fixture.componentInstance.imprimirSeleccionados('normales');
    expect(fixture.componentInstance.articulosImpresion()).toEqual([]);
    fixture.destroy();
  });
  it('imprime el detalle de historial con el mismo componente POS', async () => {
    vi.useFakeTimers();
    const imprimir = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    const detallePedido: HistorialValidado = {
      idOrigen: 'R1:H1', origenPedido: 'R1', creadoEnR1: true, sapDocEntry: null,
      folioPedido: '300', numeroPedido: '300', codigoVenta: null, codigoVendedor: 1,
      nombreVendedor: 'Vendedor historial', codigosAlmacen: ['BSPS01'], nombresBodega: 'Principal',
      fechaHoraPedido: '2026-09-22T08:00:00-06:00', codigoEstadoVenta: 'C',
      codigoSincronizacion: 'N', estadoLocal: 'VALIDADO', despachadoEn: '2026-09-22T09:00:00-06:00',
      validadoDetectadoEn: '2026-09-22T10:00:00-06:00', usuarioDespacho: 'Gregorio Cruz',
      estadoHistorial: 'CERRADO' as const, recibidoPor: 'Marcos Pérez',
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
    expect(fixture.componentInstance.configuracionDetalleVisual().severidadEstado).toBe('peligro');
    expect(fixture.componentInstance.detalleVisual()?.datosOperativos).toEqual(expect.arrayContaining([
      expect.objectContaining({ etiqueta: 'Recibido por', valor: 'Marcos Pérez' }),
    ]));
    expect(fixture.nativeElement.textContent).toContain('Marcos Pérez');
    fixture.componentInstance.registros.set([{ ...detallePedido, recibidoPor: null }]);
    fixture.detectChanges();
    expect(fixture.componentInstance.detalleVisual()?.datosOperativos).toEqual(expect.arrayContaining([
      expect.objectContaining({ etiqueta: 'Recibido por', valor: 'Sin registrar' }),
    ]));
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

  it('conserva todas las bodegas aplicadas al paginar y cambiar de vista', async () => {
    sessionStorage.clear();
    vi.useFakeTimers();
    const respuesta = { datos: [], paginacion: { pagina: 1, cantidadPorPagina: 25,
      cantidadDevuelta: 0, totalRegistros: 100, hayMas: true } };
    const buscar = vi.fn().mockReturnValue(of(respuesta));
    const buscarArticulos = vi.fn().mockReturnValue(of(respuesta));
    const navegar = vi.fn().mockResolvedValue(true);
    await TestBed.configureTestingModule({
      imports: [HistorialComponent],
      providers: [
        { provide: HistorialService, useValue: { buscar, buscarArticulos, obtener: vi.fn() } },
        { provide: AlmacenesService, useValue: { obtenerAlmacenes: vi.fn().mockReturnValue(of({ datos: [] })) } },
        { provide: PedidosService, useValue: { obtenerInventarioArticulo: vi.fn() } },
        { provide: ActivatedRoute, useValue: { snapshot: {
          paramMap: convertToParamMap({}), queryParamMap: convertToParamMap({}),
        } } },
        { provide: Router, useValue: { navigate: navegar, navigateByUrl: vi.fn() } },
      ],
    }).compileComponents();

    const codigos = ['BSPS04', 'BSPS03', 'BSPS08'];
    TestBed.inject(FiltrosGlobalesService).actualizar({ codigosAlmacen: codigos });
    const fixture = TestBed.createComponent(HistorialComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    const componente = fixture.componentInstance;
    expect(componente.filtros.codigosAlmacen).toEqual(codigos);
    expect(buscarArticulos).toHaveBeenLastCalledWith(expect.objectContaining({
      codigosAlmacen: codigos, clasificacion: 'especial', pagina: 1,
    }));

    componente.irPagina('normales', 2);
    expect(componente.filtros.codigosAlmacen).toEqual(codigos);
    fixture.detectChanges();
    const chips = [...fixture.nativeElement.querySelectorAll('.etiqueta-almacen')]
      .map((elemento: HTMLElement) => elemento.textContent?.trim());
    expect(chips).toEqual(expect.arrayContaining(codigos.map((codigo) => expect.stringContaining(codigo))));
    expect(buscarArticulos).toHaveBeenCalledWith(expect.objectContaining({
      codigosAlmacen: codigos, clasificacion: 'normal', pagina: 2,
    }));
    expect(navegar).toHaveBeenLastCalledWith([], expect.objectContaining({
      queryParams: expect.objectContaining({
        codigoAlmacen: codigos, pagina: '2', paginaEspeciales: '1', vista: 'articulos',
      }),
    }));

    componente.irPagina('normales', 1);
    componente.cambiarVista('pedido');
    expect(buscar).toHaveBeenCalledWith(expect.objectContaining({
      codigosAlmacen: codigos, clasificacion: 'normal', pagina: 1,
    }));
    expect(buscar).toHaveBeenCalledWith(expect.objectContaining({
      codigosAlmacen: codigos, clasificacion: 'especial', pagina: 1,
    }));
    expect(navegar).toHaveBeenLastCalledWith([], expect.objectContaining({
      queryParams: expect.objectContaining({ codigoAlmacen: codigos, vista: 'pedido' }),
    }));

    componente.cambiarVista('articulos');
    expect(buscarArticulos).toHaveBeenLastCalledWith(expect.objectContaining({
      codigosAlmacen: codigos, clasificacion: 'especial', pagina: 1,
    }));
    componente.filtros.cantidadPorPagina = 50;
    componente.cambiarCantidadPorPagina();
    expect(buscarArticulos).toHaveBeenLastCalledWith(expect.objectContaining({
      codigosAlmacen: codigos, cantidadPorPagina: 50, clasificacion: 'especial', pagina: 1,
    }));
    (componente as unknown as { cargar(automatica: boolean): void }).cargar(true);
    expect(buscarArticulos).toHaveBeenLastCalledWith(expect.objectContaining({
      codigosAlmacen: codigos, cantidadPorPagina: 50, clasificacion: 'especial', pagina: 1,
    }));
    expect(TestBed.inject(FiltrosGlobalesService).obtener().codigosAlmacen).toEqual(codigos);
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
    fixture.componentInstance.imprimirSeleccionados('especiales');
    await vi.advanceTimersByTimeAsync(0);

    const titulos = [...fixture.nativeElement.querySelectorAll('.grupo-listado-pedidos > h2')]
      .map((titulo: HTMLElement) => titulo.textContent?.trim());
    expect(titulos).toEqual(['Pedidos Normales', 'Pedidos Especiales']);
    const seccionEspeciales = fixture.nativeElement
      .querySelector('#titulo-historial-especiales')?.parentElement as HTMLElement;
    const seccionNormales = fixture.nativeElement
      .querySelector('#titulo-historial-normales')?.parentElement as HTMLElement;
    expect(seccionEspeciales.querySelector('.acciones-impresion-grupo')?.textContent)
      .toContain('Imprimir seleccionados');
    expect(seccionNormales.querySelector('.acciones-impresion-grupo')?.textContent)
      .toContain('Imprimir seleccionados');
    expect(fixture.componentInstance.cantidadSeleccionadaImpresion('especiales')).toBe(1);
    expect(fixture.componentInstance.cantidadSeleccionadaImpresion('normales')).toBe(1);
    expect(fixture.nativeElement.textContent).toContain('IMPRIMIR TODO');
    expect(fixture.componentInstance.lineasSeleccionadasImpresion().size).toBe(2);
    expect(fixture.componentInstance.articulosImpresion()
      .map(({ codigo, asignadoA }) => ({ codigo, asignadoA })))
      .toEqual([{ codigo: 'ESPECIAL', asignadoA: 'Sin asignar' }]);
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

  it('no mezcla filtros editados con el auto refresco y reinicia ambas páginas al buscar', async () => {
    sessionStorage.clear();
    vi.useFakeTimers();
    const buscarArticulos = vi.fn().mockReturnValue(of({
      datos: [], paginacion: { pagina: 1, cantidadPorPagina: 25,
        cantidadDevuelta: 0, totalRegistros: 0, hayMas: false },
    }));
    await TestBed.configureTestingModule({
      imports: [HistorialComponent],
      providers: [
        { provide: HistorialService, useValue: { buscar: vi.fn(), buscarArticulos,
          obtener: vi.fn() } },
        { provide: AlmacenesService, useValue: { obtenerAlmacenes: vi.fn()
          .mockReturnValue(of({ datos: [] })) } },
        { provide: PedidosService, useValue: { obtenerInventarioArticulo: vi.fn() } },
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
    const componente = fixture.componentInstance;
    componente.pagina.set(8);
    componente.paginaEspeciales.set(6);
    componente.alternarAlmacen('BSPS04', true);

    (componente as unknown as { cargar(automatica: boolean): void }).cargar(true);
    expect(buscarArticulos).toHaveBeenLastCalledWith(expect.objectContaining({
      codigosAlmacen: [], clasificacion: 'especial', pagina: 6,
    }));

    componente.buscar();
    expect(componente.pagina()).toBe(1);
    expect(componente.paginaEspeciales()).toBe(1);
    expect(buscarArticulos).toHaveBeenCalledWith(expect.objectContaining({
      codigosAlmacen: ['BSPS04'], clasificacion: 'normal', pagina: 1,
    }));
    expect(buscarArticulos).toHaveBeenCalledWith(expect.objectContaining({
      codigosAlmacen: ['BSPS04'], clasificacion: 'especial', pagina: 1,
    }));
    fixture.destroy();
    vi.useRealTimers();
  });

  it('no superpone rondas automaticas ni conserva el temporizador al salir', async () => {
    sessionStorage.clear();
    vi.useFakeTimers();
    const buscarArticulos = vi.fn().mockReturnValue(NEVER);
    await TestBed.configureTestingModule({
      imports: [HistorialComponent],
      providers: [
        { provide: HistorialService, useValue: { buscar: vi.fn(), buscarArticulos,
          obtener: vi.fn() } },
        { provide: AlmacenesService, useValue: { obtenerAlmacenes: vi.fn()
          .mockReturnValue(of({ datos: [] })) } },
        { provide: PedidosService, useValue: { obtenerInventarioArticulo: vi.fn() } },
        { provide: ActivatedRoute, useValue: { snapshot: {
          paramMap: convertToParamMap({}), queryParamMap: convertToParamMap({}),
        } } },
        { provide: Router, useValue: { navigate: vi.fn().mockResolvedValue(true),
          navigateByUrl: vi.fn() } },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(HistorialComponent);
    fixture.detectChanges();
    expect(buscarArticulos).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(buscarArticulos).toHaveBeenCalledTimes(2);
    fixture.destroy();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(buscarArticulos).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('no restaura número ni páginas antiguas cuando la URL no los contiene', async () => {
    sessionStorage.clear();
    sessionStorage.setItem('pedidosBodega.filtros.historial', JSON.stringify({
      numeroPedido: '101476067', pagina: 9, paginaEspeciales: 7,
      cantidadPorPagina: 25, vista: 'articulos',
    }));
    vi.useFakeTimers();
    const buscarArticulos = vi.fn().mockReturnValue(of({
      datos: [], paginacion: { pagina: 1, cantidadPorPagina: 25,
        cantidadDevuelta: 0, totalRegistros: 0, hayMas: false },
    }));
    await TestBed.configureTestingModule({
      imports: [HistorialComponent],
      providers: [
        { provide: HistorialService, useValue: { buscar: vi.fn(), buscarArticulos,
          obtener: vi.fn() } },
        { provide: AlmacenesService, useValue: { obtenerAlmacenes: vi.fn()
          .mockReturnValue(of({ datos: [] })) } },
        { provide: PedidosService, useValue: { obtenerInventarioArticulo: vi.fn() } },
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
    expect(fixture.componentInstance.filtros.numeroPedido).toBe('');
    expect(fixture.componentInstance.pagina()).toBe(1);
    expect(fixture.componentInstance.paginaEspeciales()).toBe(1);
    expect(buscarArticulos).toHaveBeenCalledWith(expect.objectContaining({
      numeroPedido: '', pagina: 1,
    }));
    fixture.destroy();
    vi.useRealTimers();
  });

  it('conserva los datos visibles y muestra el error cuando falla un refresco', async () => {
    sessionStorage.clear();
    vi.useFakeTimers();
    const buscarArticulos = vi.fn((filtros: { clasificacion?: string }) => of({
      datos: [{ idOrigen:`R1:${filtros.clasificacion}`,identificadorDetalle:'1',
        numeroPedido:filtros.clasificacion==='especial'?'200':'100',codigoArticulo:'ART',
        descripcion:'Artículo',cantidad:1,codigoAlmacen:'BSPS01',nombreAlmacen:'Bodega',
        fechaHoraPedido:'2026-10-07T10:00:00',fechaEntradaCola:'2026-10-07T10:00:00.000Z',
        despachadoEn:'2026-10-07T10:01:00.000Z',nombreVendedor:'Vendedor',
        esEspecial:filtros.clasificacion==='especial'}],
      paginacion:{pagina:1,cantidadPorPagina:25,cantidadDevuelta:1,totalRegistros:1,hayMas:false},
    }));
    await TestBed.configureTestingModule({
      imports:[HistorialComponent],
      providers:[
        {provide:HistorialService,useValue:{buscar:vi.fn(),buscarArticulos,obtener:vi.fn()}},
        {provide:AlmacenesService,useValue:{obtenerAlmacenes:vi.fn().mockReturnValue(of({datos:[]}))}},
        {provide:PedidosService,useValue:{obtenerInventarioArticulo:vi.fn()}},
        {provide:ActivatedRoute,useValue:{snapshot:{paramMap:convertToParamMap({}),queryParamMap:convertToParamMap({})}}},
        {provide:Router,useValue:{navigate:vi.fn().mockResolvedValue(true),navigateByUrl:vi.fn()}},
      ],
    }).compileComponents();
    const fixture=TestBed.createComponent(HistorialComponent);
    fixture.detectChanges();await fixture.whenStable();fixture.detectChanges();
    buscarArticulos.mockReturnValue(throwError(()=>({error:{mensaje:'Tiempo de espera agotado'}})));
    (fixture.componentInstance as unknown as {cargar(automatica:boolean):void}).cargar(false);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('100');
    expect(fixture.nativeElement.textContent).toContain('200');
    expect(fixture.nativeElement.querySelector('[role="alert"]')).not.toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('No hay pedidos en esta sección');
    fixture.destroy();vi.useRealTimers();
  });
});
