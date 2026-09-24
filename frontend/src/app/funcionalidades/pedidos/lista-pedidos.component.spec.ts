import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { Observable, Subject, of, throwError } from 'rxjs';
import { AlmacenesService } from './almacenes.service';
import { ListaPedidosComponent } from './lista-pedidos.component';
import { PedidosService } from './pedidos.service';
import { ConsultaInventarioArticuloService } from '../../compartido/inventario/consulta-inventario-articulo.service';
import { AsignacionesService } from '../../compartido/asignaciones/asignaciones.service';
import { AutenticacionService } from '../autenticacion/autenticacion.service';
import type { UsuarioSesion } from '../autenticacion/autenticacion.interface';
import { FacturadosPendientesService } from '../facturados-pendientes/facturados-pendientes.service';
import { ImpresionesService } from '../../compartido/impresiones/impresiones.service';

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
    obtenerUrlImagenArticulo: ReturnType<typeof vi.fn>;
    despacharLineas: ReturnType<typeof vi.fn>;
  };
  let almacenesService: { obtenerAlmacenes: ReturnType<typeof vi.fn> };
  let facturadosPendientesService: { listar: ReturnType<typeof vi.fn> };
  let asignacionesService: {
    obtenerUsuarios: ReturnType<typeof vi.fn>;
    consultar: ReturnType<typeof vi.fn>;
    guardar: ReturnType<typeof vi.fn>;
  };
  const usuarioSesion = signal<UsuarioSesion>({
    usuarioId: '1', nombreUsuario: 'admin', nombreVisible: 'Administrador',
    codigoRol: 'ADMINISTRADOR' as const, codigoAlmacen: null, debeCambiarContrasena: false,
  });
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
      obtenerUrlImagenArticulo: vi.fn().mockReturnValue('/api/articulos/001234/imagen'),
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
    facturadosPendientesService = {
      listar: vi.fn().mockReturnValue(of({ datos: [], paginacion: {
        pagina: 1, cantidadPorPagina: 1, totalRegistros: 0, hayMas: false,
      }, almacenesSinConfiguracion: [] })),
    };
    usuarioSesion.set({
      usuarioId: '1', nombreUsuario: 'admin', nombreVisible: 'Administrador',
      codigoRol: 'ADMINISTRADOR', codigoAlmacen: null, debeCambiarContrasena: false,
    });
    asignacionesService = {
      obtenerUsuarios: vi.fn().mockReturnValue(of({
        puedeAsignar: true,
        puedeAsignarTodos: true,
        datos: [
          { usuario: 'mperez', nombre: 'Marcos Perez' },
          { usuario: 'gcruz', nombre: 'Gregorio Cruz' },
          { usuario: 'operdomo', nombre: 'Olvin Perdomo' },
          { usuario: 'omencia', nombre: 'Osmar Mencia' },
          { usuario: 'maperdomo', nombre: 'Manuel A. Perdomo' },
          { usuario: 'osmith', nombre: 'Orlin Smith' },
          { usuario: 'dvelasquez', nombre: 'Daniel Velasquez' },
        ],
      })),
      consultar: vi.fn().mockReturnValue(of({ datos: [{
        idOrigen: 'R1:F1', identificadorDetalle: '1',
        usuarioAsignado: 'gcruz', nombreAsignado: 'Gregorio Cruz',
        actualizadoEn: '2026-08-03T12:00:00',
      }] })),
      guardar: vi.fn().mockImplementation((linea, usuarioAsignado) => of({ datos: {
        ...linea,
        usuarioAsignado,
        nombreAsignado: usuarioAsignado === 'mperez' ? 'Marcos Perez' : null,
        actualizadoEn: '2026-08-03T12:01:00',
      } })),
    };
    enrutador = { navigate: vi.fn().mockResolvedValue(true), url: '/pedidos?pagina=1' };

    await TestBed.configureTestingModule({
      imports: [ListaPedidosComponent],
      providers: [
        { provide: PedidosService, useValue: pedidosService },
        { provide: AlmacenesService, useValue: almacenesService },
        { provide: FacturadosPendientesService, useValue: facturadosPendientesService },
        { provide: ImpresionesService, useValue: { registrar: vi.fn().mockReturnValue(of({ datos: [] })) } },
        { provide: AsignacionesService, useValue: asignacionesService },
        { provide: AutenticacionService, useValue: { usuario: usuarioSesion } },
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
    expect(encabezados.some((encabezado) => encabezado.includes('Asignado a'))).toBe(true);
    expect(fixture.nativeElement.querySelector('.boton-asignar-todos')).toBeNull();
    expect(encabezados.some((encabezado) => encabezado.includes('TRANSFERIR TODO'))).toBe(true);
    expect(encabezados.some((encabezado) => encabezado.includes('IMPRIMIR TODO'))).toBe(true);
    expect(encabezados).toHaveLength(22);
    expect(componente.filtrosFormulario.fechaDesde).toBe('2026-08-03');
    expect(componente.filtrosFormulario.fechaHasta).toBe('2026-08-03');
    expect(pedidosService.obtenerPedidos).toHaveBeenCalledWith(expect.objectContaining({
      fechaDesde: '2026-08-03', fechaHasta: '2026-08-03',
    }));
  });

  it('no renderiza acceso ni reserva espacio cuando no hay facturados pendientes', () => {
    fixture.detectChanges();

    expect(componente.cantidadFacturadosPendientes()).toBe(0);
    expect(fixture.nativeElement.querySelector('.aviso-facturados-pendientes')).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('Facturados pendientes');
    expect(facturadosPendientesService.listar).toHaveBeenCalledWith({
      numeroPedido: '', fechaDesde: '', fechaHasta: '', codigosAlmacen: [],
      pagina: 1, cantidadPorPagina: 1, vista: 'articulos',
    });
  });

  it('muestra un contenedor informativo con total real, conserva la navegación y se oculta al quedar vacío', async () => {
    facturadosPendientesService.listar.mockReturnValue(of({ datos: [{}], paginacion: {
      pagina: 1, cantidadPorPagina: 1, totalRegistros: 3, hayMas: true,
    }, almacenesSinConfiguracion: [] }));
    fixture.detectChanges();

    const aviso = fixture.nativeElement.querySelector('.aviso-facturados-pendientes') as HTMLElement;
    expect(aviso).not.toBeNull();
    expect(aviso.textContent).toContain('Facturados pendientes');
    expect(aviso.textContent).toContain('3 artículos');
    expect(aviso.querySelector('button')).toBeNull();
    expect(aviso.querySelector('.enlace-facturados-pendientes')?.textContent?.trim()).toBe('Ver detalle');

    facturadosPendientesService.listar.mockReturnValue(of({ datos: [], paginacion: {
      pagina: 1, cantidadPorPagina: 1, totalRegistros: 0, hayMas: false,
    }, almacenesSinConfiguracion: [] }));
    await vi.advanceTimersByTimeAsync(15000);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.aviso-facturados-pendientes')).toBeNull();
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
        paginaEspeciales: 1, vista: 'articulos',
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
        { provide: FacturadosPendientesService, useValue: facturadosPendientesService },
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
        { provide: FacturadosPendientesService, useValue: facturadosPendientesService },
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
    const consultaInventario = TestBed.inject(ConsultaInventarioArticuloService);
    consultaInventario.abrir('001234', 'COD-COLA');
    const llamadasIniciales = pedidosService.obtenerPedidos.mock.calls.length;

    await vi.advanceTimersByTimeAsync(15000);

    expect(pedidosService.obtenerPedidos).toHaveBeenCalledTimes(llamadasIniciales + 2);
    expect(pedidosService.obtenerPedidos).toHaveBeenLastCalledWith(expect.objectContaining({
      pagina: 1, fechaDesde: '2026-08-03', fechaHasta: '2026-08-03',
    }));
    expect(pedidosService.obtenerPedidos.mock.calls.at(-1)?.[0]).not.toHaveProperty('numeroPedido');
    expect(pedidosService.obtenerPedidos.mock.calls.at(-1)?.[0].codigosAlmacen).toEqual(['BSPS01']);
    expect(componente.lineasSeleccionadasTransferencia().size).toBe(1);
    expect(consultaInventario.abierto()).toBe(true);
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

    expect(maximoActivas).toBe(2);
    expect(pedidosService.obtenerPedidos).toHaveBeenCalledTimes(4);
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
    expect(pedidosService.obtenerPedidos).toHaveBeenCalledTimes(4);
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
    const primeraSeccion = fixture.nativeElement.querySelector('.grupo-listado-pedidos') as HTMLElement;
    const filas = [...primeraSeccion.querySelectorAll('.grupo-pedido tr')] as HTMLTableRowElement[];

    expect(filas).toHaveLength(3);
    expect(filas.every((fila) => fila.cells.length === 11)).toBe(true);
    expect(filas.every((fila) => fila.tabIndex === -1)).toBe(true);
    expect(filas.every((fila) => !fila.querySelector('[rowspan]'))).toBe(true);
    expect(primeraSeccion.textContent?.match(/101468453/g)).toHaveLength(3);
    expect(primeraSeccion.textContent?.match(/Vendedor original/g)).toHaveLength(3);
    expect(primeraSeccion.querySelectorAll('.enlace-detalle')).toHaveLength(3);
    expect(primeraSeccion.querySelectorAll('.selector-asignacion')).toHaveLength(3);
    expect(primeraSeccion.querySelectorAll('.pi-print')).toHaveLength(0);
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
    pedidosService.obtenerPedidos.mockReturnValue(of({
      ...respuestaLista,
      paginacion: { ...respuestaLista.paginacion, totalRegistros: 50 },
    }));
    fixture.detectChanges();
    const botones = fixture.nativeElement.querySelectorAll(
      '.paginacion .control-pagina',
    ) as NodeListOf<HTMLButtonElement>;

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
    const boton = fixture.nativeElement.querySelector('.acciones-transferencia .boton-primario') as HTMLButtonElement;

    fila.click();
    expect(componente.lineasSeleccionadasTransferencia().size).toBe(0);
    checkTransferencia.click();
    fixture.detectChanges();
    expect(componente.lineasSeleccionadasTransferencia().size).toBe(1);
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

  it('mantiene la pantalla limpia cuando una fuente no está disponible', () => {
    pedidosService.obtenerPedidos.mockReturnValue(of({
      ...respuestaLista,
      fuentes: { retailOne: 'disponible', sap: 'no_disponible' },
    }));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.aviso-fuente')).toBeNull();
  });

  it('no abre inventario al hacer clic en la descripción', () => {
    fixture.detectChanges();
    const descripcion = fixture.nativeElement.querySelector('.columna-descripcion') as HTMLElement;
    descripcion.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();

    expect(pedidosService.obtenerInventarioArticulo).not.toHaveBeenCalled();
  });

  it('abre el modal con un clic en el código del artículo', () => {
    fixture.detectChanges();
    const codigo = fixture.nativeElement.querySelector('.codigo-consultable') as HTMLElement;
    codigo.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();

    expect(pedidosService.obtenerInventarioArticulo).toHaveBeenCalledWith('001234', 'COD-COLA');
    const consultaInventario = TestBed.inject(ConsultaInventarioArticuloService);
    expect(consultaInventario.abierto()).toBe(true);
    expect(consultaInventario.inventario()?.descripcion).toContain('Artículo visible');
  });

  it('mantiene el modal abierto y diferencia inventario inexistente de falla SAP', () => {
    const consultaInventario = TestBed.inject(ConsultaInventarioArticuloService);
    pedidosService.obtenerInventarioArticulo.mockReturnValue(throwError(() => ({ status: 404 })));
    fixture.detectChanges();
    consultaInventario.abrir('001234', 'COD-COLA');
    expect(consultaInventario.abierto()).toBe(true);
    expect(consultaInventario.estado()).toBe('no-encontrado');

    consultaInventario.cerrar();
    pedidosService.obtenerInventarioArticulo.mockReturnValue(throwError(() => ({ status: 500 })));
    consultaInventario.abrir('001234', 'COD-COLA');
    expect(consultaInventario.estado()).toBe('error');
  });

  it('mantiene bloqueada y sombreada una asignación confirmada durante el refresco', async () => {
    const pedido = respuestaLista.datos[0];
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const selector = fixture.nativeElement.querySelector('.selector-asignacion') as HTMLSelectElement;
    const boton = fixture.nativeElement.querySelector('.boton-asignar') as HTMLButtonElement;
    expect(componente.asignacionActual(pedido, pedido.articulos[0])).toMatchObject({
      usuarioAsignado: 'gcruz', nombreAsignado: 'Gregorio Cruz',
    });
    expect(selector).toBeTruthy();
    expect(selector.options).toHaveLength(1);
    expect(selector.disabled).toBe(true);
    expect(boton.disabled).toBe(true);
    expect(fixture.nativeElement.querySelector('tbody tr').classList).toContain('fila-asignada');
    expect(asignacionesService.consultar).toHaveBeenCalledWith([
      { idOrigen: 'R1:F1', identificadorDetalle: '1' },
    ]);
    expect(componente.nombreAsignado(pedido, pedido.articulos[0])).toBe('Gregorio Cruz');

    await vi.advanceTimersByTimeAsync(15000);
    fixture.detectChanges();
    expect(selector.disabled).toBe(true);
    expect(componente.nombreAsignado(pedido, pedido.articulos[0])).toBe('Gregorio Cruz');
    expect(asignacionesService.guardar).not.toHaveBeenCalled();
  });

  it('selecciona libremente y solo confirma al pulsar Asignar', () => {
    asignacionesService.consultar.mockReturnValue(of({ datos: [{
      idOrigen: 'R1:F1', identificadorDetalle: '1',
      usuarioAsignado: null, nombreAsignado: null, actualizadoEn: null,
    }] }));
    fixture.detectChanges();
    fixture.detectChanges();
    const selector = fixture.nativeElement.querySelector('.selector-asignacion') as HTMLSelectElement;
    const boton = fixture.nativeElement.querySelector('.boton-asignar') as HTMLButtonElement;
    expect(boton.disabled).toBe(true);
    expect(fixture.nativeElement.querySelector('tbody tr').classList).not.toContain('fila-asignada');

    selector.value = 'mperez';
    selector.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(asignacionesService.guardar).not.toHaveBeenCalled();
    expect(boton.disabled).toBe(false);

    boton.click();
    fixture.detectChanges();
    expect(asignacionesService.guardar).toHaveBeenCalledTimes(1);
    expect(asignacionesService.guardar).toHaveBeenCalledWith(
      { idOrigen: 'R1:F1', identificadorDetalle: '1' }, 'mperez',
    );
    const selectorConfirmado = fixture.nativeElement.querySelector('.selector-asignacion') as HTMLSelectElement;
    expect(selectorConfirmado.disabled).toBe(true);
    expect(boton.disabled).toBe(true);
    expect(fixture.nativeElement.querySelector('tbody tr').classList).toContain('fila-asignada');
    expect(fixture.nativeElement.textContent).toContain('Asignación guardada.');
  });

  it('muestra y bloquea la asignación que ganó una confirmación simultánea', () => {
    asignacionesService.consultar.mockReturnValue(of({ datos: [{
      idOrigen: 'R1:F1', identificadorDetalle: '1',
      usuarioAsignado: null, nombreAsignado: null, actualizadoEn: null,
    }] }));
    asignacionesService.guardar.mockReturnValue(throwError(() => new HttpErrorResponse({
      status: 409,
      error: { datos: {
        idOrigen: 'R1:F1', identificadorDetalle: '1',
        usuarioAsignado: 'gcruz', nombreAsignado: 'Gregorio Cruz',
        actualizadoEn: '2026-08-03T12:01:00',
      } },
    })));
    fixture.detectChanges();
    fixture.detectChanges();
    const selector = fixture.nativeElement.querySelector('.selector-asignacion') as HTMLSelectElement;
    selector.value = 'mperez';
    selector.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    (fixture.nativeElement.querySelector('.boton-asignar') as HTMLButtonElement).click();
    fixture.detectChanges();

    const selectorBloqueado = fixture.nativeElement.querySelector('.selector-asignacion') as HTMLSelectElement;
    expect(selectorBloqueado.disabled).toBe(true);
    expect(selectorBloqueado.value).toBe('gcruz');
    expect(fixture.nativeElement.querySelector('tbody tr').classList).toContain('fila-asignada');
    expect(fixture.nativeElement.textContent).toContain('Esta partida ya fue asignada a Gregorio Cruz.');
  });

  it('mantiene editable la asignación cuando no fue posible guardarla', () => {
    asignacionesService.consultar.mockReturnValue(of({ datos: [{
      idOrigen: 'R1:F1', identificadorDetalle: '1',
      usuarioAsignado: null, nombreAsignado: null, actualizadoEn: null,
    }] }));
    asignacionesService.guardar.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 500 })));
    fixture.detectChanges();
    fixture.detectChanges();
    const selector = fixture.nativeElement.querySelector('.selector-asignacion') as HTMLSelectElement;
    selector.value = 'mperez';
    selector.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    (fixture.nativeElement.querySelector('.boton-asignar') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(selector.disabled).toBe(false);
    expect(fixture.nativeElement.querySelector('tbody tr').classList).not.toContain('fila-asignada');
    expect(fixture.nativeElement.textContent).toContain('No fue posible guardar la asignación.');
  });

  it('muestra únicamente a Tommy y no guarda sin pulsar Asignar', () => {
    usuarioSesion.set({
      usuarioId: '2', nombreUsuario: 'tlopez', nombreVisible: 'Tommy López',
      codigoRol: 'CONSULTA', codigoAlmacen: null, debeCambiarContrasena: false,
    });
    asignacionesService.obtenerUsuarios.mockReturnValue(of({
      puedeAsignar: true,
      puedeAsignarTodos: false,
      datos: [{ usuario: 'tlopez', nombre: 'Tommy López' }],
    }));
    pedidosService.obtenerPedidos.mockReturnValue(of({
      ...respuestaLista,
      datos: [{ ...respuestaLista.datos[0], idOrigen: 'R1:TCIR01:F1' }],
    }));
    asignacionesService.consultar.mockReturnValue(of({ datos: [{
      idOrigen: 'R1:TCIR01:F1', identificadorDetalle: '1',
      usuarioAsignado: null, nombreAsignado: null, actualizadoEn: null,
    }] }));
    fixture.detectChanges();
    fixture.detectChanges();

    const selector = fixture.nativeElement.querySelector('.selector-asignacion') as HTMLSelectElement;
    expect([...selector.options].map(({ value, text }) => ({ value, text }))).toEqual([
      { value: '', text: 'Sin asignar' },
      { value: 'tlopez', text: 'Tommy López' },
    ]);
    expect(selector.value).toBe('tlopez');
    expect(fixture.nativeElement.textContent).not.toContain('Gregorio Cruz');
    expect(fixture.nativeElement.textContent).not.toContain('Marcos Perez');
    expect(asignacionesService.consultar).toHaveBeenCalledWith(
      [{ idOrigen: 'R1:TCIR01:F1', identificadorDetalle: '1' }],
    );
    expect(asignacionesService.guardar).not.toHaveBeenCalled();
  });

  it.each([
    ['acalix', 'Ana Calix'],
    ['jlara', 'Jorge Lara'],
  ])('%s inicia sin asignación y solo ve a Jorge Lara y Ana Calix', async (nombreUsuario, nombreVisible) => {
    usuarioSesion.set({
      usuarioId: '2', nombreUsuario, nombreVisible,
      codigoRol: 'OPERADOR_BODEGA', codigoAlmacen: null, debeCambiarContrasena: false,
    });
    asignacionesService.obtenerUsuarios.mockReturnValue(of({
      puedeAsignar: true,
      puedeAsignarTodos: false,
      datos: [
        { usuario: 'jlara', nombre: 'Jorge Lara' },
        { usuario: 'acalix', nombre: 'Ana Calix' },
      ],
    }));
    asignacionesService.consultar.mockReturnValue(of({ datos: [{
      idOrigen: 'R1:F1', identificadorDetalle: '1',
      usuarioAsignado: null, nombreAsignado: null, actualizadoEn: null,
    }] }));
    fixture.detectChanges();
    fixture.detectChanges();

    const selector = fixture.nativeElement.querySelector('.selector-asignacion') as HTMLSelectElement;
    expect(componente.puedeAsignar()).toBe(true);
    expect(componente.puedeAsignarTodos()).toBe(false);
    expect([...selector.options].map(({ value, text }) => ({ value, text }))).toEqual([
      { value: '', text: 'Sin asignar' },
      { value: 'jlara', text: 'Jorge Lara' },
      { value: 'acalix', text: 'Ana Calix' },
    ]);
    expect(selector.value).toBe('');

    selector.value = 'acalix';
    selector.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    selector.value = 'jlara';
    selector.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(asignacionesService.guardar).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(30000);
    fixture.detectChanges();
    expect(asignacionesService.guardar).not.toHaveBeenCalled();
    expect((fixture.nativeElement.querySelector('.selector-asignacion') as HTMLSelectElement).disabled)
      .toBe(false);
  });

  it.each([
    ['admin', 'ADMINISTRADOR' as const],
    ['gcruz', 'OPERADOR_BODEGA' as const],
  ])('%s conserva la lista completa sin guardar al cambiar el selector', (nombreUsuario, codigoRol) => {
    usuarioSesion.set({
      usuarioId: '2', nombreUsuario, nombreVisible: nombreUsuario,
      codigoRol, codigoAlmacen: null, debeCambiarContrasena: false,
    });
    asignacionesService.consultar.mockReturnValue(of({ datos: [{
      idOrigen: 'R1:F1', identificadorDetalle: '1',
      usuarioAsignado: null, nombreAsignado: null, actualizadoEn: null,
    }] }));
    fixture.detectChanges();
    fixture.detectChanges();

    const selector = fixture.nativeElement.querySelector('.selector-asignacion') as HTMLSelectElement;
    expect([...selector.options].map(({ value }) => value)).toEqual([
      '', 'mperez', 'gcruz', 'operdomo', 'omencia', 'maperdomo', 'osmith', 'dvelasquez',
    ]);
    selector.value = 'mperez';
    selector.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(asignacionesService.guardar).not.toHaveBeenCalled();
  });

  it('descarta una selección temporal al salir y regresar sin confirmar', () => {
    usuarioSesion.set({
      usuarioId: '2', nombreUsuario: 'acalix', nombreVisible: 'Ana Calix',
      codigoRol: 'OPERADOR_BODEGA', codigoAlmacen: null, debeCambiarContrasena: false,
    });
    asignacionesService.obtenerUsuarios.mockReturnValue(of({
      puedeAsignar: true,
      puedeAsignarTodos: false,
      datos: [
        { usuario: 'jlara', nombre: 'Jorge Lara' },
        { usuario: 'acalix', nombre: 'Ana Calix' },
      ],
    }));
    asignacionesService.consultar.mockReturnValue(of({ datos: [{
      idOrigen: 'R1:F1', identificadorDetalle: '1',
      usuarioAsignado: null, nombreAsignado: null, actualizadoEn: null,
    }] }));
    fixture.detectChanges();
    fixture.detectChanges();

    const selector = fixture.nativeElement.querySelector('.selector-asignacion') as HTMLSelectElement;
    selector.value = 'jlara';
    selector.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(selector.value).toBe('jlara');
    expect(asignacionesService.guardar).not.toHaveBeenCalled();

    fixture.destroy();
    fixture = TestBed.createComponent(ListaPedidosComponent);
    componente = fixture.componentInstance;
    fixture.detectChanges();
    fixture.detectChanges();

    expect((fixture.nativeElement.querySelector('.selector-asignacion') as HTMLSelectElement).value)
      .toBe('');
    expect(asignacionesService.guardar).not.toHaveBeenCalled();
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
