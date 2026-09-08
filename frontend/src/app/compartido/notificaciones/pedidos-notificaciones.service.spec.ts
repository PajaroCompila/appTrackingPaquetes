import { TestBed } from '@angular/core/testing';
import type { FiltrosPedidos, PedidoResumen } from '../../funcionalidades/pedidos/pedido.interface';
import { PedidosNotificacionesService } from './pedidos-notificaciones.service';
import { SonidoNotificacionService } from './sonido-notificacion.service';

const filtros = (cambios: Partial<FiltrosPedidos> = {}): FiltrosPedidos => ({
  fechaDesde: '2026-09-08',
  fechaHasta: '2026-09-08',
  pagina: 1,
  cantidadPorPagina: 25,
  ...cambios,
});

const pedido = (idOrigen: string, codigosAlmacen: string[]): PedidoResumen => ({
  idOrigen,
  origenPedido: 'R1',
  creadoEnR1: true,
  sapDocEntry: null,
  folioPedido: idOrigen,
  numeroPedido: idOrigen,
  codigoVenta: null,
  codigoVendedor: null,
  nombreVendedor: null,
  codigosAlmacen,
  nombresBodega: null,
  fechaHoraPedido: '2026-09-08T10:00:00',
  codigoEstadoVenta: null,
  codigoSincronizacion: null,
  articulos: codigosAlmacen.map((codigoAlmacen, indice) => ({
    identificadorDetalle: String(indice + 1),
    codigoArticulo: `ART-${indice + 1}`,
    descripcion: 'Artículo',
    cantidad: 1,
    codigoAlmacen,
    nombreAlmacen: codigoAlmacen,
  })),
});

describe('PedidosNotificacionesService', () => {
  let servicio: PedidosNotificacionesService;
  let sonido: { reproducir: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    sonido = { reproducir: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        PedidosNotificacionesService,
        { provide: SonidoNotificacionService, useValue: sonido },
      ],
    });
    servicio = TestBed.inject(PedidosNotificacionesService);
  });

  it('toma la primera respuesta como base sin notificar pedidos existentes', () => {
    expect(servicio.procesarRespuesta(
      [pedido('R1:1', ['BSPS03']), pedido('R1:2', ['BSPS03'])], filtros(), false,
    )).toBe(0);
    expect(servicio.noLeidos()).toBe(0);
    expect(sonido.reproducir).not.toHaveBeenCalled();
  });

  it('cuenta una vez cada pedido nuevo aunque tenga varias líneas', () => {
    servicio.procesarRespuesta([pedido('R1:1', ['BSPS03'])], filtros(), true);
    const multilinea = pedido('R1:2', ['BSPS03', 'BSPS03', 'BSPS03']);

    expect(servicio.procesarRespuesta([multilinea, multilinea], filtros(), false)).toBe(1);
    expect(servicio.noLeidos()).toBe(1);
    expect(sonido.reproducir).toHaveBeenCalledOnce();
  });

  it('solo notifica pedidos que pertenecen a uno de los almacenes seleccionados', () => {
    const seleccion = filtros({ codigosAlmacen: ['BSPS03', 'BSPS05'] });
    servicio.procesarRespuesta([], seleccion, true);

    expect(servicio.procesarRespuesta([
      pedido('R1:1', ['TSPS01']),
      pedido('R1:2', ['BSPS05']),
      pedido('R1:3', ['TSPS01', 'BSPS03']),
    ], seleccion, false)).toBe(2);
    expect(servicio.noLeidos()).toBe(2);
  });

  it('con todos los almacenes acepta cualquier pedido permitido por la respuesta', () => {
    servicio.procesarRespuesta([], filtros({ codigosAlmacen: [] }), true);

    expect(servicio.procesarRespuesta([
      pedido('R1:1', ['BSPS03']), pedido('SAP:2', ['TTGU01']),
    ], filtros({ codigosAlmacen: [] }), false)).toBe(2);
  });

  it('reproduce un solo sonido cuando llegan varios pedidos en el mismo ciclo', () => {
    servicio.procesarRespuesta([], filtros(), true);
    const nuevos = Array.from({ length: 5 }, (_, indice) => pedido(`R1:${indice}`, ['BSPS03']));

    expect(servicio.procesarRespuesta(nuevos, filtros(), false)).toBe(5);
    expect(servicio.noLeidos()).toBe(5);
    expect(sonido.reproducir).toHaveBeenCalledOnce();
  });

  it('reconstruye la base al cambiar almacenes o fechas', () => {
    const bodegaSps = filtros({ codigosAlmacen: ['BSPS03'] });
    const tiendaSps = filtros({ codigosAlmacen: ['TSPS01'] });
    servicio.procesarRespuesta([pedido('R1:1', ['BSPS03'])], bodegaSps, true);

    expect(servicio.procesarRespuesta([
      pedido('R1:2', ['TSPS01']), pedido('R1:3', ['TSPS01']),
    ], tiendaSps, false)).toBe(0);
    expect(servicio.procesarRespuesta([
      pedido('R1:4', ['TSPS01']),
    ], filtros({ fechaDesde: '2026-09-07', codigosAlmacen: ['TSPS01'] }), false)).toBe(0);
    expect(servicio.noLeidos()).toBe(0);
  });

  it('no vuelve a avisar por un pedido que desaparece y reaparece', () => {
    servicio.procesarRespuesta([], filtros(), true);
    servicio.procesarRespuesta([pedido('R1:1', ['BSPS03'])], filtros(), false);
    servicio.procesarRespuesta([], filtros(), false);

    expect(servicio.procesarRespuesta([pedido('R1:1', ['BSPS03'])], filtros(), false)).toBe(0);
    expect(servicio.noLeidos()).toBe(1);
    expect(sonido.reproducir).toHaveBeenCalledOnce();
  });

  it('marca el contador como visto sin alterar los pedidos conocidos', () => {
    servicio.procesarRespuesta([], filtros(), true);
    servicio.procesarRespuesta([pedido('R1:1', ['BSPS03'])], filtros(), false);

    servicio.marcarComoVistos();

    expect(servicio.noLeidos()).toBe(0);
    expect(servicio.procesarRespuesta([pedido('R1:1', ['BSPS03'])], filtros(), false)).toBe(0);
  });

  it('inicia una sesión nueva sin contador ni pedidos conocidos', () => {
    servicio.procesarRespuesta([], filtros(), true);
    servicio.procesarRespuesta([pedido('R1:1', ['BSPS03'])], filtros(), false);

    servicio.reiniciarSesion();

    expect(servicio.noLeidos()).toBe(0);
    expect(servicio.procesarRespuesta([pedido('R1:1', ['BSPS03'])], filtros(), false)).toBe(0);
    expect(sonido.reproducir).toHaveBeenCalledOnce();
  });
});
