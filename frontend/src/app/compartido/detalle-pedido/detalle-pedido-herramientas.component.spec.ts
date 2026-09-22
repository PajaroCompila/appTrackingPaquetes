import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { of, Subject, throwError } from 'rxjs';
import { DetallePedidoVistaComponent } from './detalle-pedido-vista.component';
import type { ConfiguracionDetallePedido, PedidoDetalleVisual } from './detalle-pedido-vista.interface';
import { AsignacionesService } from '../asignaciones/asignaciones.service';
import type { AsignacionArticulo } from '../asignaciones/asignacion.interface';
import { ImpresionesService } from '../impresiones/impresiones.service';

describe('Detalle pendiente: bodegas, selección y asignación antes de imprimir', () => {
  let fixture: ComponentFixture<DetallePedidoVistaComponent>;
  const configuracion: ConfiguracionDetallePedido = { contexto: 'Pedido pendiente', titulo: 'Detalle', descripcion: '',
    etiquetaEstado: 'Pendiente', severidadEstado: 'advertencia', etiquetaRetorno: 'Regresar', tituloInformacion: 'Información',
    etiquetaArticulos: 'Artículos del pedido', herramientasImpresionPendiente: true };
  const pedido: PedidoDetalleVisual = { idOrigen: 'R1:TSPS01:QA', numeroPedido: 'QA', vendedor: 'Vendedor',
    fechaPedido: '2026-09-17T08:00:00-06:00', bodega: 'BSPS01, BSPS02', datosOperativos: [],
    articulos: [1, 2, 3].map(n => ({ clave: String(n), identificadorDetalle: String(n), codigo: 'A' + n,
      descripcion: 'Artículo ' + n, cantidad: n, codigoAlmacen: n === 2 ? 'BSPS02' : 'BSPS01', responsable: 'Sin asignar' })) };
  const estados = new Map<string, AsignacionArticulo>();
  const asignaciones = { consultar: vi.fn(), obtenerUsuarios: vi.fn(), guardar: vi.fn(), reasignar: vi.fn() };
  const impresiones = { consultar: vi.fn(), registrar: vi.fn() };
  const asignacion = (n: string, usuario: string | null = null): AsignacionArticulo => ({ idOrigen: pedido.idOrigen,
    identificadorDetalle: n, usuarioAsignado: usuario, nombreAsignado: usuario, asignadoEn: null, actualizadoEn: null });

  beforeEach(async () => {
    vi.useFakeTimers();
    for (const nombre of ['showModal', 'close'] as const) {
      if (!HTMLDialogElement.prototype[nombre]) Object.defineProperty(HTMLDialogElement.prototype, nombre, {
        configurable: true, value(this: HTMLDialogElement) { this.open = nombre === 'showModal'; },
      });
      vi.spyOn(HTMLDialogElement.prototype, nombre).mockImplementation(function (this: HTMLDialogElement) { this.open = nombre === 'showModal'; });
    }
    vi.spyOn(window, 'print').mockImplementation(() => undefined);
    estados.clear();
    Object.values(asignaciones).forEach(m => m.mockReset());
    Object.values(impresiones).forEach(m => m.mockReset());
    impresiones.consultar.mockReturnValue(of({ datos: [] }));
    impresiones.registrar.mockImplementation((lineas: AsignacionArticulo[]) => of({ datos: lineas.map(a => ({ ...a,
      cantidadImpresiones: 1, ultimaImpresionEn: '2026-09-17T14:00:00Z' })) }));
    asignaciones.consultar.mockImplementation((lineas: AsignacionArticulo[]) => of({ datos: lineas.map(l => estados.get(l.identificadorDetalle) ?? asignacion(l.identificadorDetalle)) }));
    asignaciones.obtenerUsuarios.mockReturnValue(of({ puedeAsignar: true, datos: [{ usuario: 'mperez', nombre: 'Marcos Perez' }] }));
    asignaciones.guardar.mockImplementation((linea: AsignacionArticulo, usuario: string) => {
      const datos = { ...asignacion(linea.identificadorDetalle, usuario), nombreAsignado: 'Marcos Perez' };
      estados.set(linea.identificadorDetalle, datos); return of({ datos });
    });
    await TestBed.configureTestingModule({ imports: [DetallePedidoVistaComponent], providers: [
      { provide: AsignacionesService, useValue: asignaciones }, { provide: ImpresionesService, useValue: impresiones },
    ] }).compileComponents();
    fixture = TestBed.createComponent(DetallePedidoVistaComponent);
    fixture.componentRef.setInput('configuracion', configuracion);
    fixture.componentRef.setInput('pedido', pedido); fixture.detectChanges();
  });
  afterEach(() => { fixture.destroy(); vi.useRealTimers(); vi.restoreAllMocks(); });
  const componente = () => fixture.componentInstance;
  function pedirImpresion(): void { componente().seleccionarTodos(); componente().imprimirSeleccionados(); fixture.detectChanges(); }

  it('detecta bodegas y las activa; seleccionar todos alterna y respeta selección individual', () => {
    expect([...componente().bodegasSeleccionadas()]).toEqual(['BSPS01', 'BSPS02']);
    fixture.nativeElement.querySelector('.columna-imprimir-detalle .accion-seleccion-todo').click(); fixture.detectChanges();
    expect(componente().lineasSeleccionadas().size).toBe(3);
    expect(fixture.nativeElement.querySelector('.boton-imprimir-detalle').textContent).toContain('(3)');
    componente().alternarSeleccion(pedido.articulos[1]!, false); expect(componente().todosSeleccionados()).toBe(false);
    componente().seleccionarTodos(); expect(componente().lineasSeleccionadas().size).toBe(3);
    componente().seleccionarTodos(); expect(componente().lineasSeleccionadas().size).toBe(0);
  });
  it('quitar una bodega elimina filas y selección; reincluirla no restaura selección oculta', () => {
    componente().seleccionarTodos(); componente().cambiarBodega('BSPS02', false); fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(componente().lineasSeleccionadas().size).toBe(2);
    expect(componente().totalUnidades(componente().articulosVisibles())).toBe(4);
    componente().cambiarBodega('BSPS02', true); fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('tbody tr')).toHaveLength(3);
    expect(componente().estaSeleccionado(pedido.articulos[1]!)).toBe(false);
  });
  it('sin bodegas activas no hay artículos imprimibles ni seleccionados', () => {
    componente().seleccionarTodos(); componente().cambiarBodega('BSPS01', false); componente().cambiarBodega('BSPS02', false);
    fixture.detectChanges(); expect(componente().lineasSeleccionadas().size).toBe(0);
    expect(fixture.nativeElement.querySelector('.boton-imprimir-detalle').disabled).toBe(true);
    componente().imprimirSeleccionados(); expect(asignaciones.consultar).not.toHaveBeenCalled();
  });
  it('seleccionar todos omite artículos sin permiso o sin identidad', () => {
    fixture.componentRef.setInput('pedido', { ...pedido, articulos: pedido.articulos.map((a, n) => n === 1 ? { ...a, operacionPermitida: false } : n === 2 ? { ...a, identificadorDetalle: null } : a) });
    fixture.detectChanges(); componente().seleccionarTodos(); expect(componente().lineasSeleccionadas().size).toBe(1);
  });
  it('conserva bodegas desactivadas al refrescar, incorpora nuevas y poda artículos retirados', () => {
    componente().seleccionarTodos(); componente().cambiarBodega('BSPS02', false);
    fixture.componentRef.setInput('pedido', { ...pedido, articulos: [pedido.articulos[1]!, { ...pedido.articulos[0]!, clave: '4', identificadorDetalle: '4', codigoAlmacen: 'BSPS03' }] });
    fixture.detectChanges(); expect([...componente().bodegasSeleccionadas()]).toEqual(['BSPS03']);
    expect(componente().lineasSeleccionadas().size).toBe(0);
  });
  it('todos asignados siguen directo al flujo actual y conservan confirmación y eventos', () => {
    pedido.articulos.forEach(a => estados.set(a.identificadorDetalle!, asignacion(a.identificadorDetalle!, 'mperez')));
    pedirImpresion(); vi.runAllTimers(); expect(window.print).toHaveBeenCalledOnce();
    expect(asignaciones.obtenerUsuarios).not.toHaveBeenCalled(); expect(asignaciones.guardar).not.toHaveBeenCalled();
    expect(componente().articulosImpresion().map(({ vendedor, asignadoA }) => ({ vendedor, asignadoA })))
      .toEqual([
        { vendedor: 'Vendedor', asignadoA: 'mperez' },
        { vendedor: 'Vendedor', asignadoA: 'mperez' },
        { vendedor: 'Vendedor', asignadoA: 'mperez' },
      ]);
    componente().alCerrarImpresion(); componente().registrarImpresionConfirmada();
    expect(impresiones.registrar).toHaveBeenCalledOnce(); expect(componente().lineasImpresas().size).toBe(3);
  });
  it('modal muestra solo faltantes visibles, guarda únicamente esos y luego abre impresión', () => {
    estados.set('1', asignacion('1', 'gcruz')); componente().cambiarBodega('BSPS02', false); pedirImpresion();
    expect(componente().articulosSinResponsable().map(a => a.codigo)).toEqual(['A3']);
    expect(fixture.nativeElement.querySelector('app-asignacion-impresion dialog').open).toBe(true);
    expect(window.print).not.toHaveBeenCalled(); componente().asignarYContinuarImpresion('mperez'); vi.runAllTimers();
    expect(asignaciones.guardar).toHaveBeenCalledExactlyOnceWith({ idOrigen: pedido.idOrigen, identificadorDetalle: '3' }, 'mperez');
    expect(asignaciones.reasignar).not.toHaveBeenCalled(); expect(window.print).toHaveBeenCalledOnce();
    expect(componente().articulosImpresion().map(a => a.codigo)).toEqual(['A1', 'A3']);
    expect(impresiones.registrar).not.toHaveBeenCalled();
  });
  it('cancelar o ESC no guarda, no imprime ni cambia estado', () => {
    pedirImpresion(); fixture.nativeElement.querySelector('app-asignacion-impresion .boton-secundario').click();
    expect(asignaciones.guardar).not.toHaveBeenCalled(); expect(window.print).not.toHaveBeenCalled();
    expect(componente().lineasImpresas().size).toBe(0); componente().imprimirSeleccionados(); fixture.detectChanges();
    fixture.nativeElement.querySelector('app-asignacion-impresion dialog').dispatchEvent(new Event('cancel', { cancelable: true }));
    expect(componente().solicitarResponsable()).toBe(false); expect(asignaciones.guardar).not.toHaveBeenCalled();
  });
  it('otra sesión asigna mientras el modal está abierto: respeta al ganador sin sobrescribir', () => {
    pedirImpresion(); pedido.articulos.forEach(a => estados.set(a.identificadorDetalle!, asignacion(a.identificadorDetalle!, 'gcruz')));
    componente().asignarYContinuarImpresion('mperez'); vi.runAllTimers();
    expect(asignaciones.guardar).not.toHaveBeenCalled(); expect(window.print).toHaveBeenCalledOnce();
  });
  it('un 409 conserva responsable vigente sin llamar Reasignar', () => {
    pedirImpresion(); asignaciones.guardar.mockImplementation((linea: AsignacionArticulo) => throwError(() => new HttpErrorResponse({ status: 409,
      error: { datos: asignacion(linea.identificadorDetalle, 'gcruz') } })));
    componente().asignarYContinuarImpresion('mperez'); vi.runAllTimers();
    expect(window.print).toHaveBeenCalledOnce(); expect(asignaciones.reasignar).not.toHaveBeenCalled();
  });
  it('guardado parcial fallido no imprime y reintentar consulta/omite lo que ya se guardó', () => {
    pedirImpresion(); const normal = asignaciones.guardar.getMockImplementation()!;
    asignaciones.guardar.mockImplementationOnce(normal).mockReturnValueOnce(throwError(() => new Error('503')));
    componente().asignarYContinuarImpresion('mperez');
    expect(window.print).not.toHaveBeenCalled(); expect(componente().asignandoResponsables()).toBe(false);
    expect(componente().errorAsignacionImpresion()).toContain('se conservan');
    componente().asignarYContinuarImpresion('mperez'); vi.runAllTimers();
    expect(asignaciones.guardar.mock.calls.filter(c => c[0].identificadorDetalle === '1')).toHaveLength(1);
    expect(window.print).toHaveBeenCalledOnce();
  });
  it('doble clic no duplica escrituras; selección y filtro se congelan solo durante el flujo', () => {
    pedirImpresion(); const respuesta = new Subject<{ datos: AsignacionArticulo }>();
    asignaciones.guardar.mockReturnValue(respuesta);
    componente().asignarYContinuarImpresion('mperez'); componente().asignarYContinuarImpresion('mperez');
    componente().cambiarBodega('BSPS02', false); componente().seleccionarTodos();
    expect(asignaciones.guardar).toHaveBeenCalledOnce(); expect(componente().lineasSeleccionadas().size).toBe(3);
    expect(componente().bodegasSeleccionadas().has('BSPS02')).toBe(true);
  });
  it('sin permisos de asignación muestra aviso y no acepta responsable fuera del catálogo', () => {
    asignaciones.obtenerUsuarios.mockReturnValue(of({ puedeAsignar: false, datos: [] })); pedirImpresion();
    expect(componente().usuariosAsignablesImpresion()).toEqual([]);
    componente().asignarYContinuarImpresion('mperez'); expect(asignaciones.guardar).not.toHaveBeenCalled();
    expect(componente().errorAsignacionImpresion()).toContain('no puede asignar');
  });
  it('imprime asignaciones existentes de otra persona sin modificarlas', () => {
    pedido.articulos.forEach(a => estados.set(a.identificadorDetalle!, asignacion(a.identificadorDetalle!, 'acalix')));
    pedirImpresion(); vi.runAllTimers(); expect(window.print).toHaveBeenCalledOnce();
    expect(asignaciones.guardar).not.toHaveBeenCalled();
    expect(asignaciones.reasignar).not.toHaveBeenCalled();
    expect(componente().articulosImpresion().map(({ asignadoA }) => asignadoA))
      .toEqual(['acalix', 'acalix', 'acalix']);
  });
  it('fallo o respuesta incompleta al consultar no permite imprimir', () => {
    asignaciones.consultar.mockReturnValueOnce(throwError(() => new Error('503'))); pedirImpresion();
    expect(componente().consultandoResponsables()).toBe(false); expect(window.print).not.toHaveBeenCalled();
    asignaciones.consultar.mockReturnValue(of({ datos: [] })); componente().imprimirSeleccionados();
    expect(window.print).not.toHaveBeenCalled(); expect(componente().solicitarResponsable()).toBe(false);
  });
  it('cambiar pedido ignora consultas antiguas; cambio de artículos en el modal exige revisar', () => {
    const respuesta = new Subject<{ datos: AsignacionArticulo[] }>(); asignaciones.consultar.mockReturnValueOnce(respuesta);
    pedirImpresion(); fixture.componentRef.setInput('pedido', { ...pedido, idOrigen: 'SAP:999' }); fixture.detectChanges();
    respuesta.next({ datos: [asignacion('1')] }); expect(componente().solicitarResponsable()).toBe(false);
    fixture.componentRef.setInput('pedido', pedido); fixture.detectChanges(); pedirImpresion();
    fixture.componentRef.setInput('pedido', { ...pedido, articulos: pedido.articulos.map(a => ({ ...a, cantidad: 99 })) }); fixture.detectChanges();
    componente().asignarYContinuarImpresion('mperez'); expect(asignaciones.guardar).not.toHaveBeenCalled();
    expect(window.print).not.toHaveBeenCalled(); expect(componente().mensajeImpresion()).toContain('cambiaron');
  });
  it('otras configuraciones de detalle mantienen impresión y vista anteriores sin herramientas nuevas', () => {
    fixture.componentRef.setInput('configuracion', { ...configuracion, herramientasImpresionPendiente: false }); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.filtro-bodegas-detalle')).toBeNull();
    expect(fixture.nativeElement.querySelector('.boton-seleccionar-todos')).toBeNull();
    expect(fixture.nativeElement.querySelector('.columna-imprimir-detalle .accion-seleccion-todo')
      .textContent).toContain('IMPRIMIR TODO');
    componente().alternarSeleccion(pedido.articulos[0]!, true); componente().imprimirSeleccionados(); vi.runAllTimers();
    expect(window.print).toHaveBeenCalledOnce(); expect(asignaciones.consultar).not.toHaveBeenCalled();
  });
});
