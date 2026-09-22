import { signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { BehaviorSubject, Subject, of, throwError } from 'rxjs';
import { AsignacionesService } from '../../compartido/asignaciones/asignaciones.service';
import { claveArticuloAsignado, type AsignacionArticulo } from '../../compartido/asignaciones/asignacion.interface';
import { DetallePedidoVistaComponent } from '../../compartido/detalle-pedido/detalle-pedido-vista.component';
import { ImpresionesService } from '../../compartido/impresiones/impresiones.service';
import { AutenticacionService } from '../autenticacion/autenticacion.service';
import { DetallePedidoComponent } from './detalle-pedido.component';
import { PedidosService } from './pedidos.service';
import type { DetallePedido } from './pedido.interface';

describe('Detalle pendiente: refresco silencioso, simetría y transferencia existente', () => {
  let fixture: ComponentFixture<DetallePedidoComponent>;
  const idOrigen = 'R1:TSPS01:QA';
  const linea = (n: number) => ({ idOrigen, identificadorDetalle: String(n) });
  const asignacion = (n: number, nombre = 'Gregorio Cruz'): AsignacionArticulo => ({ ...linea(n),
    usuarioAsignado: 'gcruz', nombreAsignado: nombre, asignadoEn: null, actualizadoEn: null });
  const datos: DetallePedido = {
    cabecera: { idOrigen, origenPedido: 'R1', creadoEnR1: true, sapDocEntry: null, folioPedido: 'QA', numeroPedido: 'QA',
      codigoVenta: null, codigoVendedor: 1, nombreVendedor: 'Vendedor', codigosAlmacen: ['BSPS01', 'BSPS02'],
      nombresBodega: 'Principal, Secundaria', fechaHoraPedido: '2026-09-17T08:00:00-06:00',
      fechaEntradaCola: '2026-09-17T10:00:00.000Z', codigoEstadoVenta: 'A',
      codigoSincronizacion: null, articulos: [] },
    partidas: [1, 2, 3].map(n => ({ numeroPartida: String(n), codigoArticulo: 'A' + n, descripcionArticulo: 'Artículo ' + n,
      cantidadSolicitada: n, codigoAlmacen: n === 2 ? 'BSPS02' : 'BSPS01', nombreAlmacen: 'Bodega', codigoEstadoEntrega: 'A' })),
  };
  const pedidos = { obtenerDetallePedido: vi.fn(), despacharLineas: vi.fn() };
  const asignaciones = { consultar: vi.fn(), obtenerUsuarios: vi.fn() };
  const impresiones = { consultar: vi.fn(), registrar: vi.fn() };
  const sesion = signal({ nombreUsuario: 'sistemas', codigoRol: 'ADMINISTRADOR' });
  const ruta = new BehaviorSubject(convertToParamMap({ folioPedido: idOrigen }));
  const router = { navigateByUrl: vi.fn(), navigate: vi.fn(), parseUrl: vi.fn() };
  const fallo = () => throwError(() => new HttpErrorResponse({ status: 503 }));
  const componente = () => fixture.componentInstance;
  const vista = () => fixture.debugElement.query(By.directive(DetallePedidoVistaComponent)).componentInstance as DetallePedidoVistaComponent;
  const articulo = (n: number) => vista().pedido!.articulos.find(a => a.identificadorDetalle === String(n))!;
  const boton = () => fixture.nativeElement.querySelector('.boton-transferir-detalle') as HTMLButtonElement;

  beforeEach(async () => {
    vi.useFakeTimers();
    for (const nombre of ['showModal', 'close'] as const) {
      if (!HTMLDialogElement.prototype[nombre]) Object.defineProperty(HTMLDialogElement.prototype, nombre, {
        configurable: true, value(this: HTMLDialogElement) { this.open = nombre === 'showModal'; },
      });
      vi.spyOn(HTMLDialogElement.prototype, nombre).mockImplementation(function (this: HTMLDialogElement) { this.open = nombre === 'showModal'; });
    }
    [...Object.values(pedidos), ...Object.values(asignaciones), ...Object.values(impresiones), ...Object.values(router)].forEach(m => m.mockReset());
    pedidos.obtenerDetallePedido.mockReturnValue(of({ datos }));
    router.navigate.mockResolvedValue(true);
    pedidos.despacharLineas.mockReturnValue(of({ datos: { transferidas: [linea(1)], omitidas: [], rechazadas: [] } }));
    asignaciones.consultar.mockReturnValue(of({ datos: [asignacion(1), asignacion(2), asignacion(3)] }));
    asignaciones.obtenerUsuarios.mockReturnValue(of({ datos: [], puedeAsignar: true }));
    impresiones.consultar.mockReturnValue(of({ datos: [] }));
    sesion.set({ nombreUsuario: 'sistemas', codigoRol: 'ADMINISTRADOR' });
    ruta.next(convertToParamMap({ folioPedido: idOrigen }));
    await TestBed.configureTestingModule({ imports: [DetallePedidoComponent], providers: [
      { provide: PedidosService, useValue: pedidos }, { provide: AsignacionesService, useValue: asignaciones },
      { provide: ImpresionesService, useValue: impresiones }, { provide: AutenticacionService, useValue: { usuario: sesion } },
      { provide: Router, useValue: router }, { provide: ActivatedRoute, useValue: { paramMap: ruta,
        snapshot: { queryParamMap: convertToParamMap({}) } } },
    ] }).compileComponents();
    fixture = TestBed.createComponent(DetallePedidoComponent);
    fixture.detectChanges();
  });
  afterEach(() => { fixture.destroy(); vi.useRealTimers(); vi.restoreAllMocks(); });

  it('muestra el tiempo pendiente avanzando desde la entrada real a la cola', () => {
    componente().ahoraTiempoMs.set(Date.parse('2026-09-17T10:23:00.000Z'));
    fixture.detectChanges();
    expect(componente().tiempoTotal()).toBe('23:00');
    expect(fixture.nativeElement.textContent).toContain('Tiempo total');
    expect(fixture.nativeElement.textContent).toContain('23:00');
  });

  it('no vacía responsables ni activa loader mientras una consulta de asignaciones está pendiente', async () => {
    const pendiente = new Subject<{ datos: AsignacionArticulo[] }>();
    asignaciones.consultar.mockReturnValue(pendiente);
    const anterior = componente().detalleVisual();
    await vi.advanceTimersByTimeAsync(5000); fixture.detectChanges();
    expect(componente().cargando()).toBe(false);
    expect(componente().detalleVisual()).toBe(anterior);
    expect(fixture.nativeElement.querySelector('.esqueleto')).toBeNull();
    expect(articulo(1).responsable).toBe('Gregorio Cruz');
    pendiente.next({ datos: [asignacion(1, 'Gregorio actualizado'), asignacion(2), asignacion(3)] }); fixture.detectChanges();
    expect(articulo(1).responsable).toBe('Gregorio actualizado');
  });
  it('respuestas idénticas conservan el objeto del detalle y el nodo real de cada fila', async () => {
    const anterior = componente().detalleVisual();
    const fila = fixture.nativeElement.querySelector('tbody tr');
    pedidos.obtenerDetallePedido.mockReturnValue(of({ datos: structuredClone(datos) }));
    await vi.advanceTimersByTimeAsync(10000); fixture.detectChanges();
    expect(componente().detalleVisual()).toBe(anterior);
    expect(fixture.nativeElement.querySelector('tbody tr')).toBe(fila);
    expect(pedidos.obtenerDetallePedido).toHaveBeenCalledTimes(3);
  });
  it('actualiza el dato modificado sin reconstruir filas con identidad idOrigen + partida', async () => {
    const fila = fixture.nativeElement.querySelector('tbody tr');
    pedidos.obtenerDetallePedido.mockReturnValue(of({ datos: { ...datos, partidas: datos.partidas.map((p, i) => i === 0 ? { ...p, descripcionArticulo: 'Actualizado' } : p) } }));
    await vi.advanceTimersByTimeAsync(5000); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('tbody tr')).toBe(fila);
    expect(fila.textContent).toContain('Actualizado');
    expect(articulo(1).clave).toBe(`${idOrigen}:1`);
  });
  it('mantiene impresión, transferencia, bodegas desactivadas y modal activo durante el polling', async () => {
    vista().alternarSeleccion(articulo(1), true);
    vista().alternarTransferencia(articulo(3), true);
    vista().cambiarBodega('BSPS02', false);
    vista().solicitarResponsable.set(true);
    await vi.advanceTimersByTimeAsync(5000); fixture.detectChanges();
    expect(vista().estaSeleccionado(articulo(1))).toBe(true);
    expect(vista().seleccionadoTransferencia(articulo(3))).toBe(true);
    expect(vista().bodegasSeleccionadas().has('BSPS02')).toBe(false);
    expect(vista().solicitarResponsable()).toBe(true);
  });
  it('ignora una consulta de responsables anterior a la actualización emitida por el modal', async () => {
    const pendiente = new Subject<{ datos: AsignacionArticulo[] }>();
    asignaciones.consultar.mockReturnValue(pendiente);
    await vi.advanceTimersByTimeAsync(5000);
    componente().actualizarAsignaciones([asignacion(1, 'Nuevo responsable')]);
    pendiente.next({ datos: [asignacion(1)] }); fixture.detectChanges();
    expect(componente().asignaciones().get(claveArticuloAsignado(linea(1)))?.nombreAsignado).toBe('Nuevo responsable');
  });
  it('fallos de refresco conservan los datos y no reemplazan la pantalla por un error', async () => {
    const anterior = componente().detalle();
    pedidos.obtenerDetallePedido.mockReturnValue(fallo());
    await vi.advanceTimersByTimeAsync(5000); fixture.detectChanges();
    expect(componente().detalle()).toBe(anterior);
    expect(componente().error()).toBeNull();
    expect(componente().cargando()).toBe(false);
  });
  it('sigue consultando el estado de impresión aunque los datos del pedido no hayan cambiado', async () => {
    const inicial = impresiones.consultar.mock.calls.length;
    await vi.advanceTimersByTimeAsync(5000); fixture.detectChanges();
    expect(impresiones.consultar).toHaveBeenCalledTimes(inicial + 1);
  });
  it('mueve el badge junto al título y ordena los tres botones correctamente', () => {
    const encabezado = fixture.nativeElement.querySelector('app-encabezado-articulos-detalle');
    expect(encabezado.querySelector('.titulo-con-contador h2').textContent).toContain('Artículos del pedido');
    expect(encabezado.querySelector('.titulo-con-contador .contador-articulos').textContent).toContain('3 artículos');
    expect(encabezado.querySelector('.acciones-articulos-detalle .contador-articulos')).toBeNull();
    expect([...encabezado.querySelectorAll('button')].map((b: unknown) => (b as HTMLButtonElement).textContent?.trim()))
      .toEqual(['Transferir a despachados (0)', 'Imprimir seleccionados (0)']);
    expect(fixture.nativeElement.querySelector('.boton-seleccionar-todos')).toBeNull();
  });
  it('seleccionar todos continúa siendo selección de impresión y no selecciona transferencias', () => {
    vista().seleccionarTodos(); fixture.detectChanges();
    expect(vista().lineasSeleccionadas().size).toBe(3);
    expect(vista().lineasSeleccionadasTransferencia().size).toBe(0);
    expect(boton().disabled).toBe(true);
  });
  it('habilita el botón azul al seleccionar una línea válida, independientemente de impresión', () => {
    vista().alternarTransferencia(articulo(1), true); fixture.detectChanges();
    expect(boton().disabled).toBe(false);
    expect(boton().classList.contains('boton-primario')).toBe(true);
    expect(boton().textContent).toContain('(1)');
    expect(vista().lineasSeleccionadas().size).toBe(0);
  });
  it('transfiere solo la selección y navega con el idOrigen confirmado sin vaciar el detalle', () => {
    const fila = fixture.nativeElement.querySelector('tbody tr');
    pedidos.obtenerDetallePedido.mockReturnValue(fallo());
    vista().alternarTransferencia(articulo(1), true); vista().alternarTransferencia(articulo(3), true);
    vista().alternarSeleccion(articulo(2), true);
    vista().transferir(); fixture.detectChanges();
    expect(pedidos.despacharLineas).toHaveBeenCalledExactlyOnceWith([linea(1), linea(3)]);
    expect(componente().detalle()?.partidas.map(p => p.numeroPartida)).toEqual(['1', '2', '3']);
    expect(vista().lineasSeleccionadasTransferencia().size).toBe(0);
    expect(vista().estaSeleccionado(articulo(2))).toBe(true);
    expect(fixture.nativeElement.querySelector('tbody tr')).toBe(fila);
    expect(router.navigateByUrl).not.toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledExactlyOnceWith(['/pedidos-despachados', idOrigen], {
      queryParams: { retorno: '/pedidos-despachados' },
    });
    expect(componente().transfiriendo()).toBe(true);
    expect(componente().cargando()).toBe(false);
  });
  it('bloquea doble transferencia mientras la petición está en curso', () => {
    pedidos.despacharLineas.mockReturnValue(new Subject());
    vista().alternarTransferencia(articulo(1), true); vista().transferir(); fixture.detectChanges();
    vista().transferir(); componente().transferirSeleccionados([linea(1)]);
    expect(pedidos.despacharLineas).toHaveBeenCalledOnce();
    expect(boton().disabled).toBe(true);
    expect(fixture.nativeElement.querySelector('.esqueleto')).toBeNull();
  });
  it('una transferencia fallida conserva selección y artículos para reintentar', () => {
    pedidos.despacharLineas.mockReturnValue(throwError(() => ({ error: { mensaje: 'Selección no disponible' } })));
    vista().alternarTransferencia(articulo(1), true); vista().transferir(); fixture.detectChanges();
    expect(componente().detalle()?.partidas).toHaveLength(3);
    expect(vista().seleccionadoTransferencia(articulo(1))).toBe(true);
    expect(boton().disabled).toBe(false);
    expect(componente().mensajeTransferencia()).toBe('Selección no disponible');
    expect(router.navigate).not.toHaveBeenCalled();
  });
  it('ignora el polling anterior y no refresca mientras navega al despacho confirmado', async () => {
    const pendiente = new Subject<{ datos: DetallePedido }>();
    pedidos.obtenerDetallePedido.mockReturnValueOnce(pendiente).mockReturnValue(fallo());
    await vi.advanceTimersByTimeAsync(5000);
    componente().transferirSeleccionados([linea(1)]);
    const anterior = componente().detalle();
    pendiente.next({ datos: { ...datos, partidas: [] } }); fixture.detectChanges();
    expect(componente().detalle()).toBe(anterior);
    expect(componente().detalle()?.partidas).toHaveLength(3);
    expect(pedidos.obtenerDetallePedido).toHaveBeenCalledTimes(2);
    expect(router.navigate).toHaveBeenCalledOnce();
  });
  it('al transferir todo navega sin mostrar un pendiente vacío antes de salir', () => {
    pedidos.despacharLineas.mockReturnValue(of({ datos: { transferidas: [linea(1), linea(2), linea(3)], omitidas: [], rechazadas: [] } }));
    pedidos.obtenerDetallePedido.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 404 })));
    componente().transferirSeleccionados([linea(1), linea(2), linea(3)]); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('Este pedido no tiene artículos.');
    expect(componente().detalle()?.partidas).toHaveLength(3);
    expect(componente().error()).toBeNull();
    expect(router.navigateByUrl).not.toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledOnce();
  });
  it('no navega si el backend no confirma ninguna línea seleccionada', () => {
    pedidos.despacharLineas.mockReturnValue(of({ datos: { transferidas: [{ idOrigen: 'SAP:OTRO', identificadorDetalle: '1' }],
      omitidas: [linea(1)], rechazadas: [] } }));
    componente().transferirSeleccionados([linea(1)]);
    expect(router.navigate).not.toHaveBeenCalled();
    expect(componente().transfiriendo()).toBe(false);
    expect(componente().detalle()?.partidas).toHaveLength(3);
  });
  it('mantiene el bloqueo contra doble clic hasta finalizar la navegación Angular', async () => {
    let completar!: (resultado: boolean) => void;
    router.navigate.mockReturnValue(new Promise<boolean>(resolve => { completar = resolve; }));
    componente().transferirSeleccionados([linea(1)]); fixture.detectChanges();
    componente().transferirSeleccionados([linea(1)]);
    expect(pedidos.despacharLineas).toHaveBeenCalledOnce();
    expect(boton().disabled).toBe(true);
    await vi.advanceTimersByTimeAsync(10000);
    expect(pedidos.obtenerDetallePedido).toHaveBeenCalledOnce();
    completar(true); await Promise.resolve();
    expect(componente().transfiriendo()).toBe(true);
  });
  it('si Angular cancela la navegación recupera la pantalla consultando el estado real', async () => {
    router.navigate.mockResolvedValue(false);
    pedidos.obtenerDetallePedido.mockReturnValue(of({ datos: { ...datos, partidas: datos.partidas.slice(1) } }));
    componente().transferirSeleccionados([linea(1)]);
    await Promise.resolve(); fixture.detectChanges();
    expect(componente().transfiriendo()).toBe(false);
    expect(componente().detalle()?.partidas.map(p => p.numeroPartida)).toEqual(['2', '3']);
    expect(componente().mensajeTransferencia()).toContain('no se pudo abrir el detalle despachado');
  });
  it('reutiliza también el idOrigen real de un pedido directo SAP', () => {
    const idSap = 'SAP:958523';
    pedidos.obtenerDetallePedido.mockReturnValue(of({ datos: { ...datos, cabecera: { ...datos.cabecera, idOrigen: idSap } } }));
    ruta.next(convertToParamMap({ folioPedido: idSap }));
    pedidos.despacharLineas.mockReturnValue(of({ datos: { transferidas: [{ idOrigen: idSap, identificadorDetalle: '1' }], omitidas: [], rechazadas: [] } }));
    componente().transferirSeleccionados([{ idOrigen: idSap, identificadorDetalle: '1' }]);
    expect(router.navigate).toHaveBeenCalledExactlyOnceWith(['/pedidos-despachados', idSap], {
      queryParams: { retorno: '/pedidos-despachados' },
    });
  });
  it('quitar una bodega poda transferencias ocultas sin alterar seleccionar todos para impresión', () => {
    vista().alternarTransferencia(articulo(2), true); vista().seleccionarTodos();
    vista().cambiarBodega('BSPS02', false); fixture.detectChanges();
    expect(vista().lineasSeleccionadasTransferencia().size).toBe(0);
    expect(vista().lineasSeleccionadas().size).toBe(2);
    expect(boton().disabled).toBe(true);
  });
  it('no habilita transferencia para roles no autorizados', () => {
    sesion.set({ nombreUsuario: 'vendedor', codigoRol: 'VENDEDOR' }); fixture.detectChanges();
    componente().transferirSeleccionados([linea(1)]);
    expect(pedidos.despacharLineas).not.toHaveBeenCalled();
    expect(boton()).toBeNull();
  });
  it('ignora líneas ajenas al pedido, sin identidad o sin permiso operativo existente', () => {
    sesion.set({ nombreUsuario: 'ana', codigoRol: 'OPERADOR_BODEGA' }); fixture.detectChanges();
    vista().alternarTransferencia(articulo(1), true); vista().transferir();
    componente().transferirSeleccionados([{ idOrigen: 'SAP:OTRO', identificadorDetalle: '1' }, linea(9), linea(1)]);
    expect(pedidos.despacharLineas).not.toHaveBeenCalled();
    expect(vista().puedeTransferir({ ...articulo(1), identificadorDetalle: null })).toBe(false);
  });
  it('no superpone consultas de detalle y atiende el refresco pendiente al terminar', async () => {
    const pendiente = new Subject<{ datos: DetallePedido }>();
    pedidos.obtenerDetallePedido.mockReturnValueOnce(pendiente).mockReturnValue(of({ datos }));
    await vi.advanceTimersByTimeAsync(15000);
    expect(pedidos.obtenerDetallePedido).toHaveBeenCalledTimes(2);
    pendiente.next({ datos });
    expect(pedidos.obtenerDetallePedido).toHaveBeenCalledTimes(3);
    expect(componente().cargando()).toBe(false);
  });
  it('descarta respuestas de otra ruta y muestra loader únicamente al entrar al nuevo pedido', async () => {
    const pendiente = new Subject<{ datos: DetallePedido }>();
    const nuevo = { ...datos, cabecera: { ...datos.cabecera, idOrigen: 'SAP:OTRO', numeroPedido: 'OTRO' } };
    pedidos.obtenerDetallePedido.mockReturnValueOnce(pendiente).mockReturnValue(of({ datos: nuevo }));
    await vi.advanceTimersByTimeAsync(5000);
    ruta.next(convertToParamMap({ folioPedido: 'SAP:OTRO' })); fixture.detectChanges();
    expect(componente().cargando()).toBe(true);
    expect(fixture.nativeElement.querySelector('.esqueleto')).not.toBeNull();
    pendiente.next({ datos }); fixture.detectChanges();
    expect(componente().detalle()?.cabecera.numeroPedido).toBe('OTRO');
    expect(componente().cargando()).toBe(false);
  });
  it('consultas lentas de responsables no se superponen ni quedan invalidadas por cada tick', async () => {
    const pendiente = new Subject<{ datos: AsignacionArticulo[] }>();
    asignaciones.consultar.mockReturnValueOnce(pendiente).mockReturnValue(of({ datos: [asignacion(1, 'Actualizado')] }));
    await vi.advanceTimersByTimeAsync(15000);
    expect(asignaciones.consultar).toHaveBeenCalledTimes(2);
    pendiente.next({ datos: [asignacion(1, 'Actualizado')] }); fixture.detectChanges();
    expect(asignaciones.consultar).toHaveBeenCalledTimes(3);
    expect(articulo(1).responsable).toBe('Actualizado');
  });
  it('IMPRIMIR TODO selecciona visibles, permite desmarcar individualmente y alterna sin tocar transferencia', () => {
    vista().cambiarBodega('BSPS02', false); fixture.detectChanges();
    const accion = fixture.nativeElement.querySelector('.columna-imprimir-detalle .accion-seleccion-todo') as HTMLButtonElement;
    accion.click(); fixture.detectChanges();
    expect(vista().lineasSeleccionadas().size).toBe(2);
    expect(vista().lineasSeleccionadasTransferencia().size).toBe(0);
    expect(fixture.nativeElement.querySelector('.boton-imprimir-detalle').textContent).toContain('(2)');
    vista().alternarSeleccion(articulo(1), false); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.boton-imprimir-detalle').textContent).toContain('(1)');
    accion.click(); accion.click(); fixture.detectChanges();
    expect(vista().lineasSeleccionadas().size).toBe(0);
    expect(impresiones.registrar).not.toHaveBeenCalled();
  });
  it('TRANSFERIR TODO selecciona visibles, permite desmarcar individualmente y alterna sin imprimir ni despachar', () => {
    vista().cambiarBodega('BSPS02', false); fixture.detectChanges();
    const accion = fixture.nativeElement.querySelector('th.columna-cantidad .accion-seleccion-todo') as HTMLButtonElement;
    accion.click(); fixture.detectChanges();
    expect(vista().lineasSeleccionadasTransferencia().size).toBe(2);
    expect(vista().lineasSeleccionadas().size).toBe(0);
    expect(boton().textContent).toContain('(2)');
    vista().alternarTransferencia(articulo(1), false); fixture.detectChanges();
    expect(boton().textContent).toContain('(1)');
    accion.click(); accion.click(); fixture.detectChanges();
    expect(vista().lineasSeleccionadasTransferencia().size).toBe(0);
    expect(pedidos.despacharLineas).not.toHaveBeenCalled();
  });
  it('selección masiva respeta permisos y se bloquea durante transferencia', () => {
    componente().actualizarAsignaciones([{ ...asignacion(2), usuarioAsignado: 'ana' }]);
    sesion.set({ nombreUsuario: 'gcruz', codigoRol: 'OPERADOR_BODEGA' }); fixture.detectChanges();
    vista().seleccionarTodasTransferencias(); expect(vista().lineasSeleccionadasTransferencia().size).toBe(3);
    vista().seleccionarTodasTransferencias();
    sesion.set({ nombreUsuario: 'ana', codigoRol: 'OPERADOR_BODEGA' }); fixture.detectChanges();
    expect(articulo(2).operacionPermitida).toBe(true);
    vista().seleccionarTodasTransferencias(); expect(vista().lineasSeleccionadasTransferencia().size).toBe(1);
    pedidos.despacharLineas.mockReturnValue(new Subject());
    vista().transferir(); fixture.detectChanges();
    const acciones = [...fixture.nativeElement.querySelectorAll('th .accion-seleccion-todo')] as HTMLButtonElement[];
    expect(acciones.every(a => a.disabled)).toBe(true);
    vista().seleccionarTodasTransferencias(); expect(vista().lineasSeleccionadasTransferencia().size).toBe(1);
  });
});
