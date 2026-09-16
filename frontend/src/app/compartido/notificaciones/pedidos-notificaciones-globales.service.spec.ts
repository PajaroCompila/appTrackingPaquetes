import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { FiltrosGlobalesService } from '../filtros-globales.service';
import { AutenticacionService } from '../../funcionalidades/autenticacion/autenticacion.service';
import { PedidosService } from '../../funcionalidades/pedidos/pedidos.service';
import { PedidosNotificacionesGlobalesService } from './pedidos-notificaciones-globales.service';
import { PedidosNotificacionesService } from './pedidos-notificaciones.service';

describe('PedidosNotificacionesGlobalesService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-14T14:00:00-06:00'));
  });

  afterEach(() => vi.useRealTimers());

  it('vigila los pedidos recientes con las bodegas elegidas desde cualquier ruta', async () => {
    const usuario = signal({
      usuarioId: '1', nombreUsuario: 'operador', nombreVisible: 'Operador',
      codigoRol: 'OPERADOR_BODEGA' as const, codigoAlmacen: null,
      debeCambiarContrasena: false,
    });
    const obtenerPedidos = vi.fn().mockReturnValue(of({
      datos: [],
      paginacion: {
        pagina: 1, cantidadPorPagina: 100, cantidadDevuelta: 0,
        totalRegistros: 0, hayMas: false,
      },
    }));
    const procesarRespuesta = vi.fn();
    TestBed.configureTestingModule({ providers: [
      PedidosNotificacionesGlobalesService,
      { provide: AutenticacionService, useValue: { usuario } },
      { provide: FiltrosGlobalesService, useValue: {
        obtener: () => ({
          fechaDesde: '2026-09-01', fechaHasta: '2026-09-01',
          codigosAlmacen: ['BSPS03'],
        }),
      } },
      { provide: PedidosService, useValue: { obtenerPedidos } },
      { provide: PedidosNotificacionesService, useValue: { procesarRespuesta } },
    ] });

    TestBed.inject(PedidosNotificacionesGlobalesService).iniciar();
    TestBed.tick();
    await vi.advanceTimersByTimeAsync(0);

    expect(obtenerPedidos).toHaveBeenCalledWith({
      fechaDesde: '2026-09-14',
      fechaHasta: '2026-09-14',
      codigosAlmacen: ['BSPS03'],
      pagina: 1,
      cantidadPorPagina: 100,
      vista: 'pedido',
      orden: 'desc',
    });
    expect(procesarRespuesta).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(5000);
    expect(obtenerPedidos).toHaveBeenCalledTimes(2);
  });

  it('espera una sesion activa y comienza inmediatamente al iniciar sesion', async () => {
    const usuario = signal<unknown>(null);
    const obtenerPedidos = vi.fn().mockReturnValue(of({ datos: [], paginacion: {} }));
    TestBed.configureTestingModule({ providers: [
      PedidosNotificacionesGlobalesService,
      { provide: AutenticacionService, useValue: { usuario } },
      { provide: FiltrosGlobalesService, useValue: { obtener: () => ({ codigosAlmacen: [] }) } },
      { provide: PedidosService, useValue: { obtenerPedidos } },
      { provide: PedidosNotificacionesService, useValue: { procesarRespuesta: vi.fn() } },
    ] });

    TestBed.inject(PedidosNotificacionesGlobalesService).iniciar();
    await vi.advanceTimersByTimeAsync(5000);
    expect(obtenerPedidos).not.toHaveBeenCalled();

    usuario.set({ usuarioId: '2' });
    TestBed.tick();
    await vi.advanceTimersByTimeAsync(0);
    expect(obtenerPedidos).toHaveBeenCalledOnce();
  });
});
