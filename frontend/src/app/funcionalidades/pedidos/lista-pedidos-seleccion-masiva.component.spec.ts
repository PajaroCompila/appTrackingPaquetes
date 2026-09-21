import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { AsignacionesService } from '../../compartido/asignaciones/asignaciones.service';
import { ImpresionesService } from '../../compartido/impresiones/impresiones.service';
import { PedidosNotificacionesService } from '../../compartido/notificaciones/pedidos-notificaciones.service';
import { AutenticacionService } from '../autenticacion/autenticacion.service';
import { FacturadosPendientesService } from '../facturados-pendientes/facturados-pendientes.service';
import { AlmacenesService } from './almacenes.service';
import type { PedidoResumen } from './pedido.interface';
import { ListaPedidosComponent } from './lista-pedidos.component';
import { PedidosService } from './pedidos.service';

describe('ListaPedidos: selección masiva visible por sección', () => {
  let fixture: ComponentFixture<ListaPedidosComponent>;
  let componente: ListaPedidosComponent;
  let normales: PedidoResumen[];
  let especiales: PedidoResumen[];
  const despacharLineas = vi.fn();
  const registrarImpresiones = vi.fn();

  const pedido = (idOrigen: string, numeroPedido: string, detalles: string[]): PedidoResumen => ({
    idOrigen, origenPedido: 'R1', creadoEnR1: true, sapDocEntry: null,
    folioPedido: numeroPedido, numeroPedido, codigoVenta: null, codigoVendedor: 1,
    nombreVendedor: 'Vendedor', codigosAlmacen: ['BSPS01'], nombresBodega: 'Principal',
    fechaHoraPedido: '2026-09-21T08:00:00-06:00', codigoEstadoVenta: 'A', codigoSincronizacion: 'N',
    articulos: detalles.map((identificadorDetalle) => ({
      identificadorDetalle, codigoArticulo: `ART-${identificadorDetalle}`,
      descripcion: `Artículo ${identificadorDetalle}`, cantidad: 1,
      codigoAlmacen: 'BSPS01', nombreAlmacen: 'Principal',
    })),
  });

  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-21T14:00:00Z'));
    normales = [pedido('R1:NORMAL:1', '1001', ['1', '2'])];
    especiales = [pedido('R1:ESPECIAL:1', '2001', ['1'])];
    despacharLineas.mockReset().mockImplementation((lineas) => of({ datos: {
      transferidas: lineas, omitidas: [], rechazadas: [],
    } }));
    registrarImpresiones.mockReset().mockReturnValue(of({ datos: [] }));

    await TestBed.configureTestingModule({
      imports: [ListaPedidosComponent],
      providers: [
        { provide: PedidosService, useValue: {
          obtenerPedidos: vi.fn().mockImplementation((filtros) => of({
            datos: filtros.clasificacion === 'especial' ? especiales : normales,
            paginacion: { pagina: 1, cantidadPorPagina: 25,
              cantidadDevuelta: filtros.clasificacion === 'especial' ? especiales.length : normales.length,
              totalRegistros: filtros.clasificacion === 'especial' ? especiales.length : normales.length,
              hayMas: false },
          })),
          despacharLineas,
        } },
        { provide: AlmacenesService, useValue: { obtenerAlmacenes: () => of({ datos: [] }) } },
        { provide: FacturadosPendientesService, useValue: { listar: () => of({ datos: [], paginacion: {
          pagina: 1, cantidadPorPagina: 1, totalRegistros: 0, hayMas: false,
        }, almacenesSinConfiguracion: [] }) } },
        { provide: AsignacionesService, useValue: {
          obtenerUsuarios: () => of({ datos: [], puedeAsignar: false,
            puedeAsignarTodos: false, puedeReasignar: false }),
          consultar: (lineas: { idOrigen: string; identificadorDetalle: string }[]) => of({
            datos: lineas.map((linea) => ({ ...linea, usuarioAsignado: null,
              nombreAsignado: null, asignadoEn: null, actualizadoEn: null })),
          }),
        } },
        { provide: ImpresionesService, useValue: { registrar: registrarImpresiones } },
        { provide: PedidosNotificacionesService, useValue: { procesarRespuesta: vi.fn() } },
        { provide: AutenticacionService, useValue: { usuario: signal({
          usuarioId: '1', nombreUsuario: 'sistemas', nombreVisible: 'Sistemas',
          codigoRol: 'ADMINISTRADOR', codigoAlmacen: null, debeCambiarContrasena: false,
        }) } },
        { provide: ActivatedRoute, useValue: {
          queryParamMap: of(convertToParamMap({})), snapshot: { queryParamMap: convertToParamMap({}) },
        } },
        { provide: Router, useValue: { navigate: vi.fn().mockResolvedValue(true), url: '/pedidos' } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ListaPedidosComponent);
    componente = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
    vi.useRealTimers();
  });

  it('renderiza las dos acciones compactas en cada matriz', () => {
    const secciones = [...fixture.nativeElement.querySelectorAll('.grupo-listado-pedidos')] as HTMLElement[];
    expect(secciones).toHaveLength(2);
    secciones.forEach((seccion) => {
      const acciones = [...seccion.querySelectorAll('.columna-accion-masiva button')]
        .map((boton) => boton.textContent?.trim());
      expect(acciones).toEqual(['TRANSFERIR TODO', 'IMPRIMIR TODO']);
    });
  });

  it('selecciona y desmarca transferencia solo en la sección pulsada', () => {
    componente.seleccionarTodasTransferencias('normales');
    fixture.detectChanges();

    expect(componente.lineasSeleccionadasTransferencia().size).toBe(2);
    expect(componente.todasTransferenciasSeleccionadas('normales')).toBe(true);
    expect(componente.todasTransferenciasSeleccionadas('especiales')).toBe(false);
    expect(fixture.nativeElement.querySelector('.acciones-transferencia .boton-primario').textContent)
      .toContain('(2)');

    componente.seleccionarTodasTransferencias('normales');
    expect(componente.lineasSeleccionadasTransferencia().size).toBe(0);
  });

  it('mantiene impresión independiente y permite desmarcar una línea individual', () => {
    componente.seleccionarTodasTransferencias('normales');
    componente.seleccionarTodasImpresiones('normales');
    fixture.detectChanges();
    expect(componente.lineasSeleccionadasTransferencia().size).toBe(2);
    expect(componente.lineasSeleccionadasImpresion().size).toBe(2);

    const primeraImpresion = fixture.nativeElement.querySelector(
      '.grupo-listado-pedidos .selector-impresion input',
    ) as HTMLInputElement;
    primeraImpresion.click();
    fixture.detectChanges();
    expect(componente.lineasSeleccionadasImpresion().size).toBe(1);
    expect(componente.lineasSeleccionadasTransferencia().size).toBe(2);
    expect(fixture.nativeElement.querySelector('.boton-imprimir-seleccionados').textContent)
      .toContain('(1)');
  });

  it('reconcilia ambas selecciones al refrescar y elimina únicamente la línea desaparecida', async () => {
    componente.seleccionarTodasTransferencias('normales');
    componente.seleccionarTodasTransferencias('especiales');
    componente.seleccionarTodasImpresiones('normales');
    componente.seleccionarTodasImpresiones('especiales');
    expect(componente.lineasSeleccionadasTransferencia().size).toBe(3);
    expect(componente.lineasSeleccionadasImpresion().size).toBe(3);

    normales = [{ ...normales[0]!, articulos: [normales[0]!.articulos[0]!] }];
    await vi.advanceTimersByTimeAsync(15000);

    expect(componente.lineasSeleccionadasTransferencia().size).toBe(2);
    expect(componente.lineasSeleccionadasImpresion().size).toBe(2);
    expect(componente.todasTransferenciasSeleccionadas('especiales')).toBe(true);
  });

  it('transfiere una selección especial sin mezclar partidas normales', () => {
    componente.seleccionarTodasTransferencias('especiales');
    componente.transferir();

    expect(despacharLineas).toHaveBeenCalledWith([
      { idOrigen: 'R1:ESPECIAL:1', identificadorDetalle: '1' },
    ]);
    expect(componente.pedidos()).toHaveLength(1);
  });

  it('envía la selección masiva al flujo vigente de impresión y auditoría', async () => {
    const imprimir = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    componente.seleccionarTodasImpresiones('normales');
    componente.imprimirSeleccionados();
    await vi.advanceTimersByTimeAsync(0);
    componente.alCerrarImpresion();
    componente.registrarImpresionConfirmada();

    expect(imprimir).toHaveBeenCalledOnce();
    expect(registrarImpresiones).toHaveBeenCalledWith([
      { idOrigen: 'R1:NORMAL:1', identificadorDetalle: '1', codigoArticulo: 'ART-1' },
      { idOrigen: 'R1:NORMAL:1', identificadorDetalle: '2', codigoArticulo: 'ART-2' },
    ]);
    expect(componente.lineasSeleccionadasImpresion().size).toBe(0);
    imprimir.mockRestore();
  });

  it('limpia selecciones al cambiar de vista', () => {
    componente.seleccionarTodasTransferencias('normales');
    componente.seleccionarTodasImpresiones('especiales');
    componente.cambiarVista('pedido');
    expect(componente.lineasSeleccionadasTransferencia().size).toBe(0);
    expect(componente.lineasSeleccionadasImpresion().size).toBe(0);
  });
});
