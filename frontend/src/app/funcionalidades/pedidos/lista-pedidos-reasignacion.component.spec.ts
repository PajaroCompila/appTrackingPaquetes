import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { ListaPedidosComponent } from './lista-pedidos.component';
import { PedidosService } from './pedidos.service';
import { AlmacenesService } from './almacenes.service';
import { AsignacionesService } from '../../compartido/asignaciones/asignaciones.service';
import type { AsignacionArticulo } from '../../compartido/asignaciones/asignacion.interface';
import { AutenticacionService } from '../autenticacion/autenticacion.service';
import { FacturadosPendientesService } from '../facturados-pendientes/facturados-pendientes.service';
import { ImpresionesService } from '../../compartido/impresiones/impresiones.service';
import type { UsuarioSesion } from '../autenticacion/autenticacion.interface';

describe('ListaPedidos: restauración puntual de Reasignar', () => {
  const tecnicos = ['mperez', 'gcruz', 'operdomo', 'omencia', 'maperdomo', 'osmith', 'dvelasquez'];
  const usuario = signal<UsuarioSesion>({ usuarioId: 'qa', nombreUsuario: 'sistemas', nombreVisible: 'Sistemas',
    codigoRol: 'ADMINISTRADOR', codigoAlmacen: null, debeCambiarContrasena: false });
  const idOrigen = 'R1:TCIR01:QA';
  const pedido = { idOrigen, origenPedido: 'R1' as const, creadoEnR1: true, sapDocEntry: null,
    folioPedido: 'QA', numeroPedido: 'QA', codigoVenta: null, codigoVendedor: 1, nombreVendedor: 'Vendedor',
    codigosAlmacen: ['TCIR01'], nombresBodega: 'Circunvalación', fechaHoraPedido: '2026-09-17T08:00:00-06:00',
    codigoEstadoVenta: 'A', codigoSincronizacion: 'N', articulos: [1, 2].map(n => ({
      identificadorDetalle: String(n), codigoArticulo: 'QA-' + n, descripcion: 'Artículo ' + n,
      cantidad: 1, codigoAlmacen: 'TCIR01', nombreAlmacen: 'Circunvalación',
    })) };
  const asignado = (destino = 'mperez'): AsignacionArticulo => ({ idOrigen, identificadorDetalle: '1',
    usuarioAsignado: destino, nombreAsignado: destino, asignadoEn: '2026-09-17T14:00:00.000Z',
    actualizadoEn: '2026-09-17T14:00:00.000Z' });
  const servidor = new Map<string, AsignacionArticulo>();
  const servicio = { obtenerUsuarios: vi.fn(), consultar: vi.fn(), guardar: vi.fn(), reasignar: vi.fn() };
  let fixture: ComponentFixture<ListaPedidosComponent>;

  beforeEach(async () => {
    localStorage.clear(); sessionStorage.clear(); vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-17T14:05:00Z'));
    usuario.set({ ...usuario(), nombreUsuario: 'sistemas', codigoRol: 'ADMINISTRADOR' });
    servidor.clear(); servidor.set('1', asignado());
    Object.values(servicio).forEach(mock => mock.mockReset());
    servicio.obtenerUsuarios.mockImplementation(() => {
      const nombre = usuario().nombreUsuario;
      const todos = usuario().codigoRol === 'ADMINISTRADOR' || nombre === 'gcruz';
      const permitidos = todos ? tecnicos : nombre === 'tlopez' ? ['tlopez'] : ['jlara', 'acalix'];
      return of({ datos: permitidos.map(usuario => ({ usuario, nombre: usuario })),
        puedeAsignar: true, puedeAsignarTodos: todos, puedeReasignar: true });
    });
    servicio.consultar.mockImplementation((lineas: { identificadorDetalle: string }[]) => of({ datos: lineas.map(l =>
      servidor.get(l.identificadorDetalle) ?? { idOrigen, identificadorDetalle: l.identificadorDetalle,
        usuarioAsignado: null, nombreAsignado: null, asignadoEn: null, actualizadoEn: null }) }));
    const guardar = (linea: { idOrigen: string; identificadorDetalle: string }, destino: string) => {
      const datos = { ...asignado(destino), ...linea, actualizadoEn: '2026-09-17T14:06:00.000Z' };
      servidor.set(linea.identificadorDetalle, datos); return of({ datos });
    };
    servicio.guardar.mockImplementation(guardar); servicio.reasignar.mockImplementation(guardar);
    await TestBed.configureTestingModule({ imports: [ListaPedidosComponent], providers: [
      { provide: AutenticacionService, useValue: { usuario } },
      { provide: AsignacionesService, useValue: servicio },
      { provide: PedidosService, useValue: { obtenerPedidos: vi.fn().mockImplementation((f: { clasificacion: string }) =>
        of({ datos: f.clasificacion === 'especial' ? [] : [pedido],
          paginacion: { pagina: 1, cantidadPorPagina: 25, cantidadDevuelta: 1, totalRegistros: 1, hayMas: false } })) } },
      { provide: FacturadosPendientesService, useValue: { listar: () => of({ datos: [], paginacion: {
        pagina: 1, cantidadPorPagina: 1, totalRegistros: 0, hayMas: false,
      }, almacenesSinConfiguracion: [] }) } },
      { provide: ImpresionesService, useValue: { registrar: () => of({ datos: [] }) } },
      { provide: AlmacenesService, useValue: { obtenerAlmacenes: () => of({ datos: [{
        codigoAlmacen: 'TCIR01', nombreAlmacen: 'Circunvalación', codigoSucursal: 'CIR', nombreSucursal: 'CIR',
      }] }) } },
      { provide: ActivatedRoute, useValue: { queryParamMap: of(convertToParamMap({})), snapshot: { queryParamMap: convertToParamMap({}) } } },
      { provide: Router, useValue: { navigate: vi.fn().mockResolvedValue(true), url: '/pedidos' } },
    ] }).compileComponents();
  });
  afterEach(() => { fixture?.destroy(); vi.useRealTimers(); });

  function iniciar(): void {
    fixture = TestBed.createComponent(ListaPedidosComponent); fixture.detectChanges();
  }
  function fila(indice = 0): HTMLTableRowElement {
    return fixture.nativeElement.querySelectorAll('.grupo-pedido tr')[indice];
  }
  function seleccionar(destino: string, indice = 0): void {
    const combo = fila(indice).querySelector('select')!;
    combo.value = destino; combo.dispatchEvent(new Event('change')); fixture.detectChanges();
  }
  function editar(destino: string): void {
    fila().querySelector<HTMLButtonElement>('.boton-reasignar')!.click(); fixture.detectChanges(); seleccionar(destino);
  }

  it.each([
    ['sistemas', 'ADMINISTRADOR', tecnicos], ['gcruz', 'OPERADOR_BODEGA', tecnicos],
    ['jlara', 'OPERADOR_BODEGA', ['jlara', 'acalix']], ['acalix', 'OPERADOR_BODEGA', ['jlara', 'acalix']],
    ['tlopez', 'OPERADOR_BODEGA', ['tlopez']],
  ] as const)('muestra ambos botones y el catálogo vigente de %s', (nombreUsuario, codigoRol, lista) => {
    usuario.set({ ...usuario(), nombreUsuario, codigoRol }); iniciar();
    expect(fila().querySelectorAll('button')).toHaveLength(2);
    expect(fila().querySelector('select')?.disabled).toBe(true);
    expect(fixture.componentInstance.usuariosAsignables().map(t => t.usuario)).toEqual(lista);
    expect(servicio.guardar).not.toHaveBeenCalled(); expect(servicio.reasignar).not.toHaveBeenCalled();
  });

  it('seleccionar no guarda; Asignar confirma solamente una línea sin responsable', () => {
    iniciar(); seleccionar('mperez', 1);
    expect(servicio.guardar).not.toHaveBeenCalled();
    fila(1).querySelector<HTMLButtonElement>('.boton-asignar:not(.boton-reasignar)')!.click();
    fixture.detectChanges();
    expect(servicio.guardar).toHaveBeenCalledWith({ idOrigen, identificadorDetalle: '2' }, 'mperez');
    expect(servicio.reasignar).not.toHaveBeenCalled();
  });

  it('Reasignar permite editar solo el combo y el segundo clic guarda; Asignar no reasigna', () => {
    iniciar(); editar('gcruz');
    expect(fila().querySelector('select')?.disabled).toBe(false);
    expect(servicio.reasignar).not.toHaveBeenCalled();
    expect(fila().querySelector<HTMLButtonElement>('.boton-asignar:not(.boton-reasignar)')!.disabled).toBe(true);
    expect(fixture.componentInstance.valorAsignacionVisible(pedido, pedido.articulos[0]!)).toBe('gcruz');
    expect(fixture.componentInstance.puedeOperarArticulo(pedido, pedido.articulos[0]!)).toBe(true);
    fila().querySelector<HTMLButtonElement>('.boton-reasignar')!.click(); fixture.detectChanges();
    expect(servicio.reasignar).toHaveBeenCalledWith({ idOrigen, identificadorDetalle: '1' }, 'gcruz', '2026-09-17T14:00:00.000Z');
    expect(servidor.get('1')?.usuarioAsignado).toBe('gcruz');
    expect(fila().querySelector('select')?.disabled).toBe(true);
    expect(fixture.componentInstance.asignacionesGuardando().size).toBe(0);
  });

  it('el refresco no borra el borrador; recargar sin confirmar recupera el responsable persistido', async () => {
    iniciar(); editar('gcruz');
    await vi.advanceTimersByTimeAsync(15000); fixture.detectChanges();
    expect(fila().querySelector('select')?.value).toBe('gcruz');
    expect(servicio.reasignar).not.toHaveBeenCalled();
    expect(servidor.get('1')?.usuarioAsignado).toBe('mperez');
    fixture.destroy(); iniciar();
    expect(fila().querySelector('select')?.value).toBe('mperez');
  });

  it.each(['jlara', 'acalix'])('%s reasigna entre ambos sin bloquear operaciones compartidas', (nombreUsuario) => {
    usuario.set({ ...usuario(), nombreUsuario, codigoRol: 'OPERADOR_BODEGA' });
    servidor.set('1', asignado(nombreUsuario)); iniciar();
    const destino = nombreUsuario === 'jlara' ? 'acalix' : 'jlara'; editar(destino);
    expect(fixture.componentInstance.puedeOperarArticulo(pedido, pedido.articulos[0]!)).toBe(true);
    fila().querySelector<HTMLButtonElement>('.boton-reasignar')!.click(); fixture.detectChanges();
    expect(servidor.get('1')?.usuarioAsignado).toBe(destino);
    expect(fixture.componentInstance.puedeOperarArticulo(pedido, pedido.articulos[0]!)).toBe(true);
  });

  it('Tommy puede tomar una asignación CIR eligiendo su única opción y confirmando', () => {
    usuario.set({ ...usuario(), nombreUsuario: 'tlopez', codigoRol: 'OPERADOR_BODEGA' }); iniciar();
    fila().querySelector<HTMLButtonElement>('.boton-reasignar')!.click(); fixture.detectChanges();
    expect(fila().querySelector('select')?.value).toBe('');
    seleccionar('tlopez'); fila().querySelector<HTMLButtonElement>('.boton-reasignar')!.click(); fixture.detectChanges();
    expect(servidor.get('1')?.usuarioAsignado).toBe('tlopez');
  });

  it('un 409 recupera el responsable vigente y libera guardando sin congelar la fila', () => {
    iniciar(); editar('gcruz');
    servicio.reasignar.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 409,
      error: { datos: asignado('osmith') } })));
    fila().querySelector<HTMLButtonElement>('.boton-reasignar')!.click(); fixture.detectChanges();
    expect(fixture.componentInstance.asignacionesGuardando().size).toBe(0);
    expect(fixture.componentInstance.nombreAsignado(pedido, pedido.articulos[0]!)).toBe('osmith');
    expect(fixture.componentInstance.puedeOperarArticulo(pedido, pedido.articulos[0]!)).toBe(true);
  });

  it('un error temporal libera guardando y permite reintentar; doble clic pendiente no duplica', () => {
    iniciar(); editar('gcruz');
    servicio.reasignar.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 503 })));
    fila().querySelector<HTMLButtonElement>('.boton-reasignar')!.click(); fixture.detectChanges();
    expect(fixture.componentInstance.asignacionesGuardando().size).toBe(0);
    const respuesta = new Subject<{ datos: AsignacionArticulo }>(); servicio.reasignar.mockReturnValue(respuesta);
    fixture.componentInstance.confirmarReasignacion(pedido, pedido.articulos[0]!);
    fixture.componentInstance.confirmarReasignacion(pedido, pedido.articulos[0]!);
    expect(servicio.reasignar).toHaveBeenCalledTimes(2);
    respuesta.next({ datos: asignado('gcruz') });
    expect(fixture.componentInstance.asignacionesGuardando().size).toBe(0);
  });

  it('sin permiso backend no muestra Reasignar ni permite abrir edición', () => {
    servicio.obtenerUsuarios.mockReturnValue(of({ datos: tecnicos.map(usuario => ({ usuario, nombre: usuario })),
      puedeAsignar: true, puedeAsignarTodos: true, puedeReasignar: false })); iniciar();
    expect(fila().querySelector('.boton-reasignar')).toBeNull();
    fixture.componentInstance.reasignarAsignacion(pedido, pedido.articulos[0]!);
    expect(fixture.componentInstance.asignacionDesbloqueada(pedido, pedido.articulos[0]!)).toBe(false);
  });

  it.each([[0, 'ok', '00:00'], [299000, 'ok', '04:59'], [300000, 'advertencia', '05:00'],
    [599000, 'advertencia', '09:59'], [600000, 'critica', '10:00']] as const)('SLA visual idéntico en normales y especiales a los %s ms', (transcurrido, estado, tiempo) => {
    iniciar(); const componente = fixture.componentInstance;
    const entrada = '2026-09-17T14:00:00.000Z';
    const normal = { ...pedido, fechaEntradaCola: entrada, excluidoSla: false };
    const especial = { ...normal, idOrigen: 'R1:TCIR01:ESPECIAL', excluidoSla: true };
    componente.ahoraSlaMs.set(Date.parse(entrada) + transcurrido);
    expect(componente.estadoTiempoSla(normal)).toBe(estado);
    expect(componente.estadoTiempoSla(especial)).toBe(estado);
    expect(componente.tiempoSla(normal)).toBe(tiempo);
    expect(componente.tiempoSla(especial)).toBe(tiempo);
  });

  it.each(['articulos', 'pedido'] as const)('pinta ambas secciones sin Excluido en vista %s', vista => {
    iniciar(); const componente = fixture.componentInstance;
    const especial = { ...pedido, idOrigen: 'R1:TCIR01:ESPECIAL', excluidoSla: true,
      fechaEntradaCola: '2026-09-17T14:00:00.000Z' };
    componente.pedidos.set([especial]); componente.pedidosEspeciales.set([especial]);
    componente.vista.set(vista); componente.ahoraSlaMs.set(Date.parse(especial.fechaEntradaCola) + 600000); fixture.detectChanges();
    const relojes = [...fixture.nativeElement.querySelectorAll('.tiempo-sla')] as HTMLElement[];
    expect(relojes.length).toBeGreaterThanOrEqual(2);
    expect(relojes.every(r => r.textContent?.trim() === '10:00')).toBe(true);
    expect(fixture.nativeElement.querySelectorAll('.fila-sla-critica').length).toBeGreaterThanOrEqual(2);
    expect(fixture.nativeElement.textContent).not.toContain('Excluido');
  });
});
