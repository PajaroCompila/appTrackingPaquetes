import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { Observable, Subject, of, throwError } from 'rxjs';
import { AlmacenesService } from './almacenes.service';
import { ListaPedidosComponent } from './lista-pedidos.component';
import { PedidosService } from './pedidos.service';

const respuestaLista = {
  datos: [{
    idOrigen: 'R1:F1', origenPedido: 'R1' as const, creadoEnR1: true, sapDocEntry: null,
    folioPedido: 'F1', numeroPedido: '101468453', codigoVenta: null,
    codigoVendedor: 30, nombreVendedor: 'Vendedor original',
    codigosAlmacen: ['COD-COLA'], nombresBodega: 'Bodega Principal SPS',
    fechaHoraPedido: '2026-07-30T12:55:00',
    codigoEstadoVenta: 'A', codigoSincronizacion: 'N',
    articulos: [{
      identificadorDetalle: '1', codigoArticulo: '001234', descripcion: 'Artículo visible', cantidad: 2,
      codigoAlmacen: 'COD-COLA', nombreAlmacen: 'Bodega Principal SPS',
    }],
  }],
  paginacion: { pagina: 1, cantidadPorPagina: 25, cantidadDevuelta: 1, hayMas: true },
};

describe('ListaPedidosComponent', () => {
  let fixture: ComponentFixture<ListaPedidosComponent>;
  let componente: ListaPedidosComponent;
  let pedidosService: {
    obtenerPedidos: ReturnType<typeof vi.fn>;
    obtenerDetallePedido: ReturnType<typeof vi.fn>;
    obtenerInventarioArticulo: ReturnType<typeof vi.fn>;
    despacharLineas: ReturnType<typeof vi.fn>;
  };
  let almacenesService: { obtenerAlmacenes: ReturnType<typeof vi.fn> };
  let enrutador: { navigate: ReturnType<typeof vi.fn>; url: string };

  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 3, 12, 0, 0));
    pedidosService = {
      obtenerPedidos: vi.fn().mockReturnValue(of(respuestaLista)),
      obtenerDetallePedido: vi.fn().mockReturnValue(of({ datos: {
        cabecera: respuestaLista.datos[0],
        partidas: [
          { numeroPartida: '1', codigoArticulo: 'A1', descripcionArticulo: 'Descripción corta', cantidadSolicitada: 1, codigoAlmacen: 'B1', nombreAlmacen: null, codigoEstadoEntrega: 'A' },
          { numeroPartida: '2', codigoArticulo: 'A2', descripcionArticulo: 'Descripción extensa completa para impresión POS', cantidadSolicitada: 1.5, codigoAlmacen: 'B2', nombreAlmacen: null, codigoEstadoEntrega: 'A' },
        ],
      } })),
      obtenerInventarioArticulo: vi.fn().mockReturnValue(of({
        codigoArticulo: '001234', descripcion: 'Artículo visible', codigoAlmacen: 'COD-COLA',
        nombreAlmacen: 'Bodega Principal SPS', existenciaFisica: 10,
        existencias: [
          { codigoAlmacen: 'COD-COLA', nombreAlmacen: 'Bodega Principal SPS', existenciaFisica: 10 },
        ],
      })),
      despacharLineas: vi.fn().mockReturnValue(of({ datos: {
        transferidas: [{ idOrigen: 'R1:F1', identificadorDetalle: '1' }],
        omitidas: [], rechazadas: [],
      } })),
    };
    almacenesService = {
      obtenerAlmacenes: vi.fn().mockReturnValue(of({
        datos: [
          {
            codigoAlmacen: 'BSPS01', nombreAlmacen: 'Bodega principal',
            codigoSucursal: 'SPS', nombreSucursal: 'San Pedro Sula_P',
          },
          {
            codigoAlmacen: 'BSPS02', nombreAlmacen: 'Bodega secundaria',
            codigoSucursal: 'TGU', nombreSucursal: 'Tegucigalpa',
          },
        ],
      })),
    };
    enrutador = { navigate: vi.fn().mockResolvedValue(true), url: '/pedidos?pagina=1' };

    await TestBed.configureTestingModule({
      imports: [ListaPedidosComponent],
      providers: [
        { provide: PedidosService, useValue: pedidosService },
        { provide: AlmacenesService, useValue: almacenesService },
        {
          provide: ActivatedRoute,
          useValue: {
            queryParamMap: of(convertToParamMap({})),
            snapshot: { queryParamMap: convertToParamMap({}) },
          },
        },
        { provide: Router, useValue: enrutador },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ListaPedidosComponent);
    componente = fixture.componentInstance;
  });

  afterEach(() => {
    fixture?.destroy();
    vi.useRealTimers();
  });

  it('carga pedidos, catálogo y los nuevos datos operativos', () => {
    fixture.detectChanges();
    const texto = fixture.nativeElement.textContent as string;

    expect(almacenesService.obtenerAlmacenes).toHaveBeenCalledOnce();
    expect(texto).toContain('Bodega principal');
    expect(texto).toContain('COD-COLA');
    expect(texto).toContain('Artículo visible');
    expect(texto).toContain('001234');
    expect(texto).toContain('Descripción');
    expect(texto).toContain('Cantidad');
    expect(texto).toContain('Bodega principal · San Pedro Sula_P');
    expect(texto).toContain('BSPS02');
    expect(texto).toContain('Bodega secundaria · Tegucigalpa');
    expect(texto).toContain('Ver detalle');
    expect(texto).toContain('101468453');
    expect(texto).toContain('Vendedor original');
    expect(texto).toContain('BSPS01');
    expect(texto).toContain('12:55');
    expect(texto).not.toContain('Código de venta');
    expect(texto).not.toContain('Código de estado');
    expect(texto).not.toContain('F1');
    const encabezados = [...fixture.nativeElement.querySelectorAll('.tabla-contenedor > table > thead th')]
      .map((encabezado) => encabezado.textContent.trim());
    expect(encabezados).not.toContain('Estado');
    expect(encabezados).not.toContain('Creado en R1');
    expect(encabezados).toHaveLength(10);
    expect(componente.filtrosFormulario.fechaDesde).toBe('2026-08-03');
    expect(componente.filtrosFormulario.fechaHasta).toBe('2026-08-03');
    expect(pedidosService.obtenerPedidos).toHaveBeenCalledWith(expect.objectContaining({
      fechaDesde: '2026-08-03', fechaHasta: '2026-08-03',
    }));
  });

  it('conserva bodegas con el mismo nombre como opciones independientes', () => {
    almacenesService.obtenerAlmacenes.mockReturnValue(of({ datos: [
      { codigoAlmacen: 'B01', nombreAlmacen: 'Nombre original', codigoSucursal: 'S1', nombreSucursal: 'Sucursal 1' },
      { codigoAlmacen: 'B02', nombreAlmacen: 'Nombre original', codigoSucursal: 'S2', nombreSucursal: 'Sucursal 2' },
    ] }));
    fixture.detectChanges();
    const opciones = fixture.nativeElement.querySelectorAll('.opcion-almacen');

    expect(opciones.length).toBe(2);
    componente.alternarAlmacen('B01', true);
    componente.alternarAlmacen('B02', true);
    expect(componente.filtrosFormulario.codigosAlmacen).toEqual(['B01', 'B02']);
  });

  it('busca y limpia filtros reiniciando la página', () => {
    fixture.detectChanges();
    componente.filtrosFormulario.numeroPedido = ' 101468453 ';
    componente.alternarAlmacen('BSPS01', true);
    componente.alternarAlmacen('BSPS02', true);
    componente.buscar();

    expect(enrutador.navigate).toHaveBeenLastCalledWith([], expect.objectContaining({
      queryParams: expect.objectContaining({
        pagina: 1,
        numeroPedido: '101468453',
        codigoAlmacen: ['BSPS01', 'BSPS02'],
      }),
    }));

    componente.limpiarFiltros();
    expect(componente.filtrosFormulario.numeroPedido).toBe('');
    expect(componente.filtrosFormulario.codigosAlmacen).toEqual([]);
    expect(enrutador.navigate).toHaveBeenLastCalledWith([], expect.objectContaining({
      queryParams: {
        pagina: 1, cantidadPorPagina: 25,
        fechaDesde: '2026-08-03', fechaHasta: '2026-08-03',
      },
    }));
  });

  it('selecciona, resume y quita almacenes individualmente', () => {
    fixture.detectChanges();

    expect(componente.resumenAlmacenes()).toBe('Todos los almacenes');
    componente.alternarAlmacen('BSPS01', true);
    expect(componente.resumenAlmacenes()).toBe('BSPS01');
    componente.alternarAlmacen('BSPS02', true);
    expect(componente.resumenAlmacenes()).toBe('2 almacenes seleccionados');
    componente.quitarAlmacen('BSPS01');
    expect(componente.filtrosFormulario.codigosAlmacen).toEqual(['BSPS02']);
    componente.limpiarAlmacenes();
    expect(componente.resumenAlmacenes()).toBe('Todos los almacenes');
  });

  it('conserva almacenes al avanzar de página', () => {
    fixture.detectChanges();
    componente.alternarAlmacen('BSPS01', true);
    componente.filtrosFormulario.numeroPedido = '101468453';
    componente.filtrosFormulario.codigoSincronizacion = 'N';
    componente.paginaSiguiente();

    expect(enrutador.navigate).toHaveBeenCalledWith([], expect.objectContaining({
      queryParams: expect.objectContaining({
        pagina: 2,
        cantidadPorPagina: 25,
        numeroPedido: '101468453',
        codigoAlmacen: ['BSPS01'],
        codigoSincronizacion: 'N',
      }),
    }));
    expect(componente.filtrosFormulario.codigosAlmacen).toEqual(['BSPS01']);
  });

  it('respeta fechas existentes en la URL', async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [ListaPedidosComponent],
      providers: [
        { provide: PedidosService, useValue: pedidosService },
        { provide: AlmacenesService, useValue: almacenesService },
        { provide: ActivatedRoute, useValue: {
          queryParamMap: of(convertToParamMap({ fechaDesde: '2026-07-01', fechaHasta: '2026-07-02' })),
          snapshot: { queryParamMap: convertToParamMap({}) },
        } },
        { provide: Router, useValue: enrutador },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(ListaPedidosComponent);
    componente = fixture.componentInstance;
    fixture.detectChanges();
    expect(componente.filtrosFormulario.fechaDesde).toBe('2026-07-01');
    expect(componente.filtrosFormulario.fechaHasta).toBe('2026-07-02');
  });

  it('restaura todos los filtros desde una URL directa y normaliza página y cantidad', async () => {
    TestBed.resetTestingModule();
    const parametros = convertToParamMap({
      numeroPedido: '101468453',
      fechaDesde: '2026-07-01',
      fechaHasta: '2026-07-02',
      codigoAlmacen: ['BSPS01', 'BSPS02'],
      codigoEstadoVenta: 'A',
      codigoSincronizacion: 'N',
      pagina: '0',
      cantidadPorPagina: '75',
    });
    await TestBed.configureTestingModule({
      imports: [ListaPedidosComponent],
      providers: [
        { provide: PedidosService, useValue: pedidosService },
        { provide: AlmacenesService, useValue: almacenesService },
        { provide: ActivatedRoute, useValue: {
          queryParamMap: of(parametros), snapshot: { queryParamMap: parametros },
        } },
        { provide: Router, useValue: enrutador },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(ListaPedidosComponent);
    componente = fixture.componentInstance;
    fixture.detectChanges();

    expect(componente.filtrosFormulario).toEqual({
      numeroPedido: '101468453',
      fechaDesde: '2026-07-01',
      fechaHasta: '2026-07-02',
      codigosAlmacen: ['BSPS01', 'BSPS02'],
      codigoSincronizacion: 'N',
      cantidadPorPagina: 25,
    });
    expect(componente.pagina()).toBe(1);
    expect(pedidosService.obtenerPedidos).toHaveBeenCalledWith(expect.objectContaining({
      numeroPedido: '101468453',
      codigosAlmacen: ['BSPS01', 'BSPS02'],
      codigoSincronizacion: 'N',
      pagina: 1,
      cantidadPorPagina: 25,
    }));
    expect(enrutador.navigate).toHaveBeenCalledWith([], expect.objectContaining({
      replaceUrl: true,
      queryParams: expect.objectContaining({ pagina: 1, cantidadPorPagina: 25 }),
    }));
    const navegacion = enrutador.navigate.mock.calls.at(-1)?.[1];
    expect(navegacion?.queryParams).not.toHaveProperty('codigoEstadoVenta');
    expect(componente.filtrosFormulario.codigosAlmacen).toEqual(['BSPS01', 'BSPS02']);
  });

  it('actualiza periódicamente con filtros aplicados sin perder selección ni modal', async () => {
    fixture.detectChanges();
    componente.alternarAlmacen('BSPS01', true);
    componente.filtrosFormulario.numeroPedido = '101468453';
    componente.alternarSeleccionTransferencia(
      respuestaLista.datos[0], respuestaLista.datos[0].articulos[0], 0, true,
    );
    componente.abrirInformacionArticulo(respuestaLista.datos[0].articulos[0]);
    const llamadasIniciales = pedidosService.obtenerPedidos.mock.calls.length;

    await vi.advanceTimersByTimeAsync(15000);

    expect(pedidosService.obtenerPedidos).toHaveBeenCalledTimes(llamadasIniciales + 1);
    expect(pedidosService.obtenerPedidos).toHaveBeenLastCalledWith(expect.objectContaining({
      pagina: 1, fechaDesde: '2026-08-03', fechaHasta: '2026-08-03',
    }));
    expect(pedidosService.obtenerPedidos.mock.calls.at(-1)?.[0]).not.toHaveProperty('numeroPedido');
    expect(pedidosService.obtenerPedidos.mock.calls.at(-1)?.[0].codigosAlmacen).toBeUndefined();
    expect(componente.lineasSeleccionadasTransferencia().size).toBe(1);
    expect(componente.dialogoInventarioAbierto()).toBe(true);
  });

  it('no cancela ni superpone una consulta que tarda más que el intervalo', async () => {
    let activas = 0;
    let maximoActivas = 0;
    pedidosService.obtenerPedidos.mockImplementation(() => new Observable((suscriptor) => {
      activas += 1;
      maximoActivas = Math.max(maximoActivas, activas);
      const temporizador = setTimeout(() => {
        suscriptor.next(respuestaLista);
        suscriptor.complete();
      }, 20000);
      return () => { clearTimeout(temporizador); activas -= 1; };
    }));
    fixture.detectChanges();
    await vi.advanceTimersByTimeAsync(35000);

    expect(maximoActivas).toBe(1);
    expect(pedidosService.obtenerPedidos).toHaveBeenCalledTimes(2);
  });

  it('conserva los datos ante un error temporal y vuelve a intentar', async () => {
    const actualizaciones = new Subject<typeof respuestaLista>();
    pedidosService.obtenerPedidos
      .mockReturnValueOnce(of(respuestaLista))
      .mockReturnValueOnce(throwError(() => new Error('temporal')))
      .mockReturnValue(actualizaciones.asObservable());
    fixture.detectChanges();
    await vi.advanceTimersByTimeAsync(15000);
    expect(componente.pedidos()).toEqual(respuestaLista.datos);
    await vi.advanceTimersByTimeAsync(15000);
    expect(pedidosService.obtenerPedidos).toHaveBeenCalledTimes(3);
    expect(componente.pedidos()).toEqual(respuestaLista.datos);
  });

  it('crea una franja completa para el primer, intermedio y último artículo', () => {
    pedidosService.obtenerPedidos.mockReturnValue(of({
      ...respuestaLista,
      datos: [{
        ...respuestaLista.datos[0],
        articulos: [
          { identificadorDetalle: '1', codigoArticulo: 'A1', descripcion: 'Una línea', cantidad: 1, codigoAlmacen: 'B1', nombreAlmacen: 'Bodega 1' },
          { identificadorDetalle: '2', codigoArticulo: 'A2', descripcion: 'Descripción suficientemente extensa para ocupar dos líneas', cantidad: 2, codigoAlmacen: 'B2', nombreAlmacen: 'Bodega 2' },
          { identificadorDetalle: '3', codigoArticulo: 'A3', descripcion: 'Última línea', cantidad: 3, codigoAlmacen: 'B3', nombreAlmacen: 'Bodega 3' },
        ],
      }],
    }));
    fixture.detectChanges();
    const filas = [...fixture.nativeElement.querySelectorAll('.grupo-pedido tr')] as HTMLTableRowElement[];

    expect(filas).toHaveLength(3);
    expect(filas.every((fila) => fila.cells.length === 10)).toBe(true);
    expect(filas.every((fila) => fila.tabIndex === -1)).toBe(true);
    expect(filas.every((fila) => !fila.querySelector('[rowspan]'))).toBe(true);
    expect(fixture.nativeElement.textContent.match(/101468453/g)).toHaveLength(3);
    expect(fixture.nativeElement.textContent.match(/Vendedor original/g)).toHaveLength(3);
    expect(fixture.nativeElement.querySelectorAll('.enlace-detalle')).toHaveLength(3);
    expect(fixture.nativeElement.querySelectorAll('.selector-impresion input[type="checkbox"]')).toHaveLength(3);
    expect(fixture.nativeElement.querySelectorAll('.pi-print')).toHaveLength(0);
    expect(filas[1]?.textContent).toContain('Descripción suficientemente extensa');
    filas[1]?.click();
    fixture.detectChanges();
    expect(componente.lineasSeleccionadasTransferencia().size).toBe(0);
  });

  it('no presenta estados temporales y usa una llave estable de partida', () => {
    pedidosService.obtenerPedidos.mockReturnValue(of({
      ...respuestaLista,
      datos: [{
        ...respuestaLista.datos[0], numeroPedido: '',
        articulos: [{
          identificadorDetalle: '7', codigoArticulo: 'ROL-DP-10',
          descripcion: 'PEDAL DAMPER PARA TECLADO', cantidad: 1,
          codigoAlmacen: 'BSPS03', nombreAlmacen: 'Bodega',
        }],
      }],
    }));
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).not.toContain('Asignando número…');
    expect(componente.claveArticulo(componente.pedidos()[0].articulos[0], 0)).toBe('7');
  });

  it('habilita la navegación según página y hayMás', () => {
    fixture.detectChanges();
    const botones = fixture.nativeElement.querySelectorAll('.paginacion button') as NodeListOf<HTMLButtonElement>;

    expect(botones[0]?.disabled).toBe(true);
    expect(botones[1]?.disabled).toBe(false);
    botones[1]?.click();
    expect(enrutador.navigate).toHaveBeenCalledWith([], expect.objectContaining({
      queryParams: expect.objectContaining({ pagina: 2 }),
    }));
  });

  it('muestra el estado sin resultados', () => {
    pedidosService.obtenerPedidos.mockReturnValue(of({
      datos: [], paginacion: { pagina: 1, cantidadPorPagina: 25, cantidadDevuelta: 0, hayMas: false },
    }));
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Sin resultados');
  });

  it('separa la selección por línea y transfiere solamente la identidad seleccionada', () => {
    fixture.detectChanges();
    const fila = fixture.nativeElement.querySelector('.grupo-pedido tr') as HTMLElement;
    const checkTransferencia = fixture.nativeElement.querySelector('.selector-transferencia input') as HTMLInputElement;
    const checkImpresion = fixture.nativeElement.querySelector('.selector-impresion input') as HTMLInputElement;
    const boton = fixture.nativeElement.querySelector('.acciones-transferencia .boton-primario') as HTMLButtonElement;

    fila.click();
    expect(componente.lineasSeleccionadasTransferencia().size).toBe(0);
    checkTransferencia.click();
    fixture.detectChanges();
    expect(componente.lineasSeleccionadasTransferencia().size).toBe(1);
    expect(componente.lineasSeleccionadasImpresion().size).toBe(0);
    expect(checkImpresion.checked).toBe(false);
    expect(boton.disabled).toBe(false);
    expect(boton.textContent).toContain('(1)');
    boton.click();
    expect(pedidosService.despacharLineas).toHaveBeenCalledWith([
      { idOrigen: 'R1:F1', identificadorDetalle: '1' },
    ]);
    expect(componente.mensajeTransferencia()).toContain('1 artículo');
    expect(componente.lineasSeleccionadasTransferencia().size).toBe(0);
  });

  it('F8 exige selección y confirmación y evita solicitudes simultáneas', () => {
    const respuestaPendiente = new Subject<{
      datos: { transferidas: { idOrigen: string; identificadorDetalle: string }[];
        omitidas: never[]; rechazadas: never[] };
    }>();
    pedidosService.despacharLineas.mockReturnValue(respuestaPendiente.asObservable());
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(false);
    fixture.detectChanges();
    const pedido = componente.pedidos()[0];

    componente.atajoF8(new KeyboardEvent('keydown', { key: 'F8', cancelable: true }));
    expect(pedidosService.despacharLineas).not.toHaveBeenCalled();
    componente.alternarSeleccionTransferencia(pedido, pedido.articulos[0], 0, true);
    componente.atajoF8(new KeyboardEvent('keydown', { key: 'F8', cancelable: true }));
    expect(pedidosService.despacharLineas).not.toHaveBeenCalled();
    confirmar.mockReturnValue(true);
    componente.atajoF8(new KeyboardEvent('keydown', { key: 'F8', cancelable: true }));
    componente.atajoF8(new KeyboardEvent('keydown', { key: 'F8', cancelable: true }));
    expect(pedidosService.despacharLineas).toHaveBeenCalledOnce();
  });

  it('advierte de forma discreta cuando una fuente no está disponible', () => {
    pedidosService.obtenerPedidos.mockReturnValue(of({
      ...respuestaLista,
      fuentes: { retailOne: 'disponible', sap: 'no_disponible' },
    }));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.aviso-fuente')?.textContent)
      .toContain('datos pueden estar incompletos');
  });

  it('abre el modal con doble clic usando código de artículo y almacén', () => {
    fixture.detectChanges();
    const descripcion = fixture.nativeElement.querySelector('.descripcion-consultable') as HTMLElement;
    descripcion.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    fixture.detectChanges();

    expect(pedidosService.obtenerInventarioArticulo).toHaveBeenCalledWith('001234', 'COD-COLA');
    expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeTruthy();
    expect(fixture.nativeElement.textContent).toContain('Existencia física en SAP');
    expect(fixture.nativeElement.textContent).toContain('10 unidades');
  });

  it('abre el mismo modal al hacer doble clic en el código del artículo', () => {
    fixture.detectChanges();
    const codigo = fixture.nativeElement.querySelector('.codigo-consultable') as HTMLElement;
    codigo.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    fixture.detectChanges();

    expect(pedidosService.obtenerInventarioArticulo).toHaveBeenCalledWith('001234', 'COD-COLA');
    expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeTruthy();
    expect(fixture.nativeElement.textContent).toContain('Artículo visible');
    expect(fixture.nativeElement.textContent).toContain('10 unidades');
  });

  it('mantiene el modal abierto y diferencia inventario inexistente de falla SAP', () => {
    pedidosService.obtenerInventarioArticulo.mockReturnValue(throwError(() => ({ status: 404 })));
    fixture.detectChanges();
    componente.abrirInformacionArticulo(respuestaLista.datos[0].articulos[0]);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No hay inventario');

    componente.cerrarInformacionArticulo();
    pedidosService.obtenerInventarioArticulo.mockReturnValue(throwError(() => ({ status: 500 })));
    componente.abrirInformacionArticulo(respuestaLista.datos[0].articulos[0]);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No pudimos consultar');
  });

  it('selecciona líneas independientes e imprime una sola vez en el orden visual', async () => {
    const imprimir = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    const segundoPedido = { ...respuestaLista.datos[0], idOrigen: 'R1:F2', folioPedido: 'F2', numeroPedido: '101468454' };
    pedidosService.obtenerPedidos.mockReturnValue(of({
      ...respuestaLista,
      datos: [
        { ...respuestaLista.datos[0], articulos: [
          { identificadorDetalle: '1', codigoArticulo: 'IGUAL', descripcion: 'Primero', cantidad: 1, codigoAlmacen: 'B1', nombreAlmacen: 'Bodega 1' },
          { identificadorDetalle: '2', codigoArticulo: 'IGUAL', descripcion: 'Segundo', cantidad: 1.5, codigoAlmacen: 'B2', nombreAlmacen: 'Bodega 2' },
        ] },
        { ...segundoPedido, articulos: [
          { identificadorDetalle: '1', codigoArticulo: 'A3', descripcion: 'Tercero', cantidad: 2, codigoAlmacen: 'B3', nombreAlmacen: 'Bodega 3' },
        ] },
      ],
    }));
    fixture.detectChanges();
    const checks = fixture.nativeElement.querySelectorAll('.selector-impresion input') as NodeListOf<HTMLInputElement>;
    const checksTransferencia = fixture.nativeElement.querySelectorAll('.selector-transferencia input') as NodeListOf<HTMLInputElement>;
    expect(checks).toHaveLength(3);
    expect(checksTransferencia).toHaveLength(3);
    expect([...checks].every((check) => check.type === 'checkbox' && check.tabIndex === 0)).toBe(true);
    const boton = fixture.nativeElement.querySelector('.boton-imprimir-seleccionados') as HTMLButtonElement;
    expect(boton.disabled).toBe(true);
    checksTransferencia[0]?.click();
    checksTransferencia[1]?.click();
    checksTransferencia[2]?.click();
    expect(componente.lineasSeleccionadasTransferencia().size).toBe(3);
    expect(componente.lineasSeleccionadasImpresion().size).toBe(0);
    expect(componente.claveLineaTransferencia(componente.pedidos()[0], componente.pedidos()[0].articulos[0], 0))
      .not.toBe(componente.claveLineaTransferencia(componente.pedidos()[0], componente.pedidos()[0].articulos[1], 1));
    checks[0]?.click();
    checks[1]?.click();
    expect(componente.lineasSeleccionadasImpresion().size).toBe(2);
    checks[1]?.click();
    checks[2]?.click();
    fixture.detectChanges();
    expect(componente.lineasSeleccionadasImpresion().size).toBe(2);
    expect(componente.lineasSeleccionadasTransferencia().size).toBe(3);
    expect(boton.textContent).toContain('(2)');
    expect(boton.disabled).toBe(false);
    boton.click();
    await vi.advanceTimersByTimeAsync(0);

    expect(pedidosService.obtenerDetallePedido).not.toHaveBeenCalled();
    expect(componente.lineasSeleccionadasTransferencia().size).toBe(3);
    expect(pedidosService.despacharLineas).not.toHaveBeenCalled();
    expect(componente.articulosImpresion()).toEqual([
      { codigo: 'IGUAL', descripcion: 'Primero', cantidad: 1, bodega: 'B1' },
      { codigo: 'A3', descripcion: 'Tercero', cantidad: 2, bodega: 'B3' },
    ]);
    expect(imprimir).toHaveBeenCalledOnce();
    expect(componente.lineasSeleccionadasImpresion().size).toBe(0);
  });

  it('mantiene solo selecciones visibles durante el refresco y las limpia al paginar', async () => {
    const pedido = respuestaLista.datos[0];
    fixture.detectChanges();
    componente.alternarSeleccionImpresion(pedido, pedido.articulos[0], 0, true);
    componente.alternarSeleccionTransferencia(pedido, pedido.articulos[0], 0, true);
    expect(componente.lineasSeleccionadasImpresion().size).toBe(1);
    expect(componente.lineasSeleccionadasTransferencia().size).toBe(1);

    pedidosService.obtenerPedidos.mockReturnValue(of({
      ...respuestaLista, datos: [{ ...pedido, articulos: [] }],
    }));
    await vi.advanceTimersByTimeAsync(15000);
    expect(componente.lineasSeleccionadasImpresion().size).toBe(0);
    expect(componente.lineasSeleccionadasTransferencia().size).toBe(0);

    pedidosService.obtenerPedidos.mockReturnValue(of(respuestaLista));
    await vi.advanceTimersByTimeAsync(15000);
    componente.alternarSeleccionImpresion(pedido, pedido.articulos[0], 0, true);
    componente.alternarSeleccionTransferencia(pedido, pedido.articulos[0], 0, true);
    componente.paginaSiguiente();
    expect(componente.lineasSeleccionadasImpresion().size).toBe(0);
    expect(componente.lineasSeleccionadasTransferencia().size).toBe(0);
  });

  it.each([
    [400, 'Revisá los filtros'],
    [503, 'El sistema no responde'],
    [500, 'No pudimos cargar los datos'],
  ])('maneja HTTP %s sin mostrar respuestas técnicas', (estado, mensaje) => {
    pedidosService.obtenerPedidos.mockReturnValue(throwError(() => new HttpErrorResponse({
      status: estado,
      error: { mensaje: 'Detalle técnico oculto', idSeguimiento: 'seguro-1' },
    })));
    fixture.detectChanges();
    const texto = fixture.nativeElement.textContent as string;

    expect(texto).toContain(mensaje);
    expect(texto).toContain('seguro-1');
    expect(texto).not.toContain('Detalle técnico oculto');
  });
});
