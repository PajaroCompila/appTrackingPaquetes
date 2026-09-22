import { signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { BehaviorSubject, Subject, of, throwError } from 'rxjs';
import { ListaPedidosComponent } from './lista-pedidos.component';
import { PedidosService } from './pedidos.service';
import { AlmacenesService } from './almacenes.service';
import type { FiltrosPedidos, PedidoResumen, RespuestaListaPedidos } from './pedido.interface';
import { AsignacionesService } from '../../compartido/asignaciones/asignaciones.service';
import { FiltrosGlobalesService } from '../../compartido/filtros-globales.service';
import { PedidosNotificacionesService } from '../../compartido/notificaciones/pedidos-notificaciones.service';
import { AutenticacionService } from '../autenticacion/autenticacion.service';
import { FacturadosPendientesService } from '../facturados-pendientes/facturados-pendientes.service';
import { ImpresionesService } from '../../compartido/impresiones/impresiones.service';

describe('ListaPedidos: almacenes aplicados automáticamente en normales y especiales', () => {
  let fixture: ComponentFixture<ListaPedidosComponent>;
  let parametros: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  const pedidos = { obtenerPedidos: vi.fn() };
  const router = { navigate: vi.fn(), url: '/pedidos' };
  const notificaciones = { procesarRespuesta: vi.fn() };
  const especial: PedidoResumen = {
    idOrigen: 'R1:TSPS01:SPSS24PE387614', origenPedido: 'R1', creadoEnR1: true,
    sapDocEntry: '962546', folioPedido: 'SPSS24PE387614', numeroPedido: '101476067',
    codigoVenta: null, codigoVendedor: 1, nombreVendedor: 'SPS Eliasar Gamaliel Gomez Cortes',
    codigosAlmacen: ['BSPS03', 'BSPS04'], nombresBodega: 'Bodega 3, Bodega 4',
    fechaHoraPedido: '2026-09-18T08:36:00', codigoEstadoVenta: 'A', codigoSincronizacion: 'N', esEspecial: true,
    articulos: [
      { identificadorDetalle: '1', codigoArticulo: 'TOR-TSP1508', descripcion: 'Artículo bodega 4', cantidad: 1, codigoAlmacen: 'BSPS04', nombreAlmacen: 'Bodega 4' },
      { identificadorDetalle: '2', codigoArticulo: 'V20K', descripcion: 'Artículo bodega 3', cantidad: 3, codigoAlmacen: 'BSPS03', nombreAlmacen: 'Bodega 3' },
    ],
  };
  const base = { pagina: '1', paginaEspeciales: '1', cantidadPorPagina: '25', vista: 'articulos',
    fechaDesde: '2026-09-18', fechaHasta: '2026-09-18', codigoAlmacen: ['BSPS03'] };
  const componente = () => fixture.componentInstance;
  const respuesta = (f: FiltrosPedidos): RespuestaListaPedidos => {
    const articulos = especial.articulos.filter(a => !f.codigosAlmacen?.length || f.codigosAlmacen.includes(a.codigoAlmacen!));
    const pedido = f.clasificacion === 'especial' ? especial : { ...especial, idOrigen: 'R1:NORMAL', numeroPedido: 'NORMAL', esEspecial: false };
    const datos = f.vista === 'pedido' ? [{ ...pedido, articulos }] : articulos.map(a => ({ ...pedido, articulos: [a], codigosAlmacen: [a.codigoAlmacen!] }));
    return { datos, paginacion: { pagina: f.pagina, cantidadPorPagina: f.cantidadPorPagina,
      cantidadDevuelta: datos.length, totalRegistros: datos.length, hayMas: false } };
  };
  const filtro = (clasificacion: 'normal' | 'especial') => pedidos.obtenerPedidos.mock.calls
    .map(([f]) => f as FiltrosPedidos).filter(f => f.clasificacion === clasificacion).at(-1)!;

  beforeEach(async () => {
    sessionStorage.clear(); localStorage.clear(); vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-18T15:00:00Z'));
    Object.values(pedidos).forEach(m => m.mockReset()); Object.values(notificaciones).forEach(m => m.mockReset());
    router.navigate.mockReset();
    parametros = new BehaviorSubject(convertToParamMap(base));
    router.navigate.mockImplementation((_comandos, opciones) => {
      const valoresUrl = Object.fromEntries(Object.entries(opciones.queryParams).map(([clave, valor]) =>
        [clave, Array.isArray(valor) ? valor.map(String) : String(valor)]));
      parametros.next(convertToParamMap(valoresUrl)); return Promise.resolve(true);
    });
    pedidos.obtenerPedidos.mockImplementation(f => of(respuesta(f)));
    await TestBed.configureTestingModule({ imports: [ListaPedidosComponent], providers: [
      { provide: PedidosService, useValue: pedidos },
      { provide: FacturadosPendientesService, useValue: { listar: () => of({ datos: [], paginacion: {
        pagina: 1, cantidadPorPagina: 1, totalRegistros: 0, hayMas: false,
      }, almacenesSinConfiguracion: [] }) } },
      { provide: ImpresionesService, useValue: { registrar: () => of({ datos: [] }) } },
      { provide: AlmacenesService, useValue: { obtenerAlmacenes: () => of({ datos: ['BSPS03', 'BSPS04'].map(codigoAlmacen => ({ codigoAlmacen, nombreAlmacen: codigoAlmacen, codigoSucursal: 'SPS', nombreSucursal: 'Principal' })) }) } },
      { provide: AsignacionesService, useValue: { obtenerUsuarios: () => of({ datos: [], puedeAsignar: false, puedeAsignarTodos: false }), consultar: () => of({ datos: [] }) } },
      { provide: AutenticacionService, useValue: { usuario: signal({ usuarioId: 'qa', nombreUsuario: 'gcruz', codigoRol: 'OPERADOR_BODEGA' }) } },
      { provide: PedidosNotificacionesService, useValue: notificaciones },
      { provide: ActivatedRoute, useValue: { queryParamMap: parametros, snapshot: { queryParamMap: convertToParamMap(base) } } },
      { provide: Router, useValue: router },
    ] }).compileComponents();
    fixture = TestBed.createComponent(ListaPedidosComponent); fixture.detectChanges();
  });
  afterEach(() => { fixture.destroy(); vi.useRealTimers(); });

  it('agregar bodega aplica ambas listas sin presionar Buscar', () => {
    componente().alternarAlmacen('BSPS04', true);
    expect(filtro('normal').codigosAlmacen).toEqual(['BSPS03', 'BSPS04']);
    expect(filtro('especial').codigosAlmacen).toEqual(['BSPS03', 'BSPS04']);
    expect(componente().pedidosEspeciales()).toHaveLength(2);
    expect(TestBed.inject(FiltrosGlobalesService).obtener().codigosAlmacen).toEqual(['BSPS03', 'BSPS04']);
  });
  it('101476067 aparece con solo BSPS04 y conserva solamente su artículo de esa bodega', () => {
    componente().alternarAlmacen('BSPS04', true); componente().quitarAlmacen('BSPS03'); fixture.detectChanges();
    expect(filtro('especial').codigosAlmacen).toEqual(['BSPS04']);
    expect(componente().pedidosEspeciales().map(p => p.numeroPedido)).toEqual(['101476067']);
    expect(componente().pedidosEspeciales()[0].articulos.map(a => a.codigoArticulo)).toEqual(['TOR-TSP1508']);
    expect(componente().pedidos()).toHaveLength(1);
  });
  it('bodega 3 sola muestra V20K sin exigir bodega 4', () => {
    expect(componente().pedidosEspeciales()[0].articulos.map(a => a.codigoArticulo)).toEqual(['V20K']);
  });
  it('quitar el chip y limpiar selección aplican el filtro nuevo en ambas listas', () => {
    componente().alternarAlmacen('BSPS04', true); componente().quitarAlmacen('BSPS03');
    expect(filtro('normal').codigosAlmacen).toEqual(['BSPS04']);
    componente().limpiarAlmacenes();
    expect(filtro('normal').codigosAlmacen).toBeUndefined();
    expect(filtro('especial').codigosAlmacen).toBeUndefined();
    expect(TestBed.inject(FiltrosGlobalesService).obtener().codigosAlmacen).toEqual([]);
  });
  it('reinicia las dos paginaciones al cambiar bodegas', () => {
    componente().pagina.set(4); componente().paginaEspeciales.set(6);
    componente().alternarAlmacen('BSPS04', true);
    expect(componente().pagina()).toBe(1); expect(componente().paginaEspeciales()).toBe(1);
    expect(router.navigate).toHaveBeenLastCalledWith([], expect.objectContaining({ queryParams: expect.objectContaining({ pagina: 1, paginaEspeciales: 1 }) }));
  });
  it('la vista Pedido mantiene el filtro y agrupa ambos artículos del especial', () => {
    componente().cambiarVista('pedido'); componente().alternarAlmacen('BSPS04', true);
    expect(filtro('especial').vista).toBe('pedido');
    expect(componente().pedidosEspeciales()).toHaveLength(1);
    expect(componente().pedidosEspeciales()[0].articulos).toHaveLength(2);
  });
  it('el refresco siguiente usa la misma selección que las notificaciones', async () => {
    componente().alternarAlmacen('BSPS04', true); componente().quitarAlmacen('BSPS03');
    await vi.advanceTimersByTimeAsync(15000);
    expect(filtro('normal').codigosAlmacen).toEqual(['BSPS04']);
    expect(filtro('especial').codigosAlmacen).toEqual(['BSPS04']);
    expect(notificaciones.procesarRespuesta.mock.calls.at(-1)?.[1].codigosAlmacen)
      .toEqual(TestBed.inject(FiltrosGlobalesService).obtener().codigosAlmacen);
  });
  it('conserva datos durante consultas lentas y descarta la respuesta del filtro anterior', async () => {
    const normalAnterior = new Subject<RespuestaListaPedidos>(); const especialAnterior = new Subject<RespuestaListaPedidos>();
    pedidos.obtenerPedidos.mockImplementationOnce(() => normalAnterior).mockImplementationOnce(() => especialAnterior);
    await vi.advanceTimersByTimeAsync(15000);
    const antes = componente().pedidosEspeciales(); const llamadas = pedidos.obtenerPedidos.mock.calls.length;
    componente().alternarAlmacen('BSPS04', true); componente().quitarAlmacen('BSPS03');
    expect(componente().pedidosEspeciales()).toBe(antes); expect(componente().cargando()).toBe(false);
    expect(pedidos.obtenerPedidos).toHaveBeenCalledTimes(llamadas);
    normalAnterior.next(respuesta({ pagina: 1, cantidadPorPagina: 25, clasificacion: 'normal', codigosAlmacen: ['BSPS03'] }));
    especialAnterior.next(respuesta({ pagina: 1, cantidadPorPagina: 25, clasificacion: 'especial', codigosAlmacen: ['BSPS03'] }));
    expect(componente().pedidosEspeciales()).toBe(antes);
    normalAnterior.complete(); especialAnterior.complete(); await Promise.resolve();
    expect(filtro('especial').codigosAlmacen).toEqual(['BSPS04']);
    expect(componente().pedidosEspeciales()[0].articulos[0].codigoAlmacen).toBe('BSPS04');
  });
  it('si falla una lista conserva sus datos y actualiza la otra sin vaciar ambas', () => {
    const anteriores = componente().pedidosEspeciales();
    pedidos.obtenerPedidos.mockImplementation(f => f.clasificacion === 'especial'
      ? throwError(() => new HttpErrorResponse({ status: 503 })) : of(respuesta(f)));
    componente().alternarAlmacen('BSPS04', true);
    expect(componente().pedidosEspeciales()).toBe(anteriores);
    expect(componente().pedidos()).toHaveLength(2); expect(componente().cargando()).toBe(false);
  });
  it('si no hay navegación de URL aplica igualmente las nuevas bodegas', async () => {
    router.navigate.mockResolvedValue(false);
    componente().alternarAlmacen('BSPS04', true); await Promise.resolve();
    expect(filtro('especial').codigosAlmacen).toEqual(['BSPS03', 'BSPS04']);
    expect(componente().pedidosEspeciales()).toHaveLength(2);
  });
  it('repetir una selección igual no genera nuevas consultas ni navegación', () => {
    const llamadas = pedidos.obtenerPedidos.mock.calls.length; const navegaciones = router.navigate.mock.calls.length;
    componente().alternarAlmacen('BSPS03', true); componente().alternarAlmacen('BSPS04', false);
    expect(pedidos.obtenerPedidos).toHaveBeenCalledTimes(llamadas); expect(router.navigate).toHaveBeenCalledTimes(navegaciones);
  });
});
