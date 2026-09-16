import { signal, type WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { App } from './app';
import { routes } from './app.routes';
import type { UsuarioSesion } from './funcionalidades/autenticacion/autenticacion.interface';
import { AutenticacionService } from './funcionalidades/autenticacion/autenticacion.service';
import { PedidosNotificacionesService } from './compartido/notificaciones/pedidos-notificaciones.service';
import { PedidosNotificacionesGlobalesService } from './compartido/notificaciones/pedidos-notificaciones-globales.service';

describe('App', () => {
  let usuario: WritableSignal<UsuarioSesion | null>;

  beforeEach(async () => {
    window.localStorage.removeItem('pedidos-bodega:sonido-notificaciones');
    usuario = signal<UsuarioSesion | null>({
      usuarioId: '1', nombreUsuario: 'operador', nombreVisible: 'Operador de bodega',
      codigoRol: 'OPERADOR_BODEGA', codigoAlmacen: 'BSPS01', debeCambiarContrasena: false,
    });
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter(routes),
        { provide: AutenticacionService, useValue: {
          usuario,
          cerrarSesion: () => of(undefined),
        } },
        { provide: PedidosNotificacionesGlobalesService, useValue: { iniciar: vi.fn() } },
      ],
    }).compileComponents();
  });

  afterEach(() => {
    window.localStorage.removeItem('pedidos-bodega:sonido-notificaciones');
  });

  it('muestra la identidad de la aplicación', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const contenido = fixture.nativeElement.textContent as string;

    expect(contenido).toContain('Pedidos Bodega');
    expect(fixture.nativeElement.querySelector('.barra-superior')).not.toBeNull();
  });

  it('oculta Dashboard y Configuración a un operador de bodega', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const enlaces = [...fixture.nativeElement.querySelectorAll('.navegacion-principal a')] as HTMLAnchorElement[];

    expect(enlaces).toHaveLength(4);
    expect(enlaces.map((enlace) => enlace.getAttribute('aria-label'))).toEqual([
      'Pedidos pendientes',
      'Pedidos despachados',
      'Pedidos devueltos',
      'Historial',
    ]);
    expect(enlaces.map((enlace) => enlace.getAttribute('href'))).toEqual([
      '/pedidos',
      '/pedidos-despachados',
      '/pedidos-devueltos',
      '/historial-validados',
    ]);
    expect(fixture.nativeElement.querySelector('a[href="/dashboard"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('a[href="/configuracion/usuarios"]')).toBeNull();
  });

  it('oculta Dashboard y Configuración a un usuario de consulta', () => {
    usuario.update((sesion) => sesion ? { ...sesion, codigoRol: 'CONSULTA' } : sesion);
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('a[href="/dashboard"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('a[href="/configuracion/usuarios"]')).toBeNull();
  });

  it('muestra Dashboard y Configuración solamente al administrador', () => {
    usuario.update((sesion) => sesion ? { ...sesion, codigoRol: 'ADMINISTRADOR' } : sesion);
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('a[href="/dashboard"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('a[href="/configuracion/usuarios"]')).not.toBeNull();
  });

  it('activa Pedidos despachados al navegar desde su enlace', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const router = TestBed.inject(Router);
    const enlace = fixture.nativeElement.querySelector(
      'a[href="/pedidos-despachados"]',
    ) as HTMLAnchorElement;

    enlace.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(router.url).toContain('/pedidos-despachados');
    expect(enlace.classList.contains('activo')).toBe(true);
    expect(fixture.nativeElement.querySelector('h1')?.textContent).toBe('Pedidos despachados');
  });

  it('mantiene el contador entre rutas y abre el panel sin limpiar las notificaciones', async () => {
    const fixture = TestBed.createComponent(App);
    const notificaciones = TestBed.inject(PedidosNotificacionesService);
    const filtros = { pagina: 1 as const, cantidadPorPagina: 25 as const };
    const nuevo = {
      idOrigen: 'R1:100', origenPedido: 'R1' as const, creadoEnR1: true,
      sapDocEntry: null, folioPedido: '100', numeroPedido: '100', codigoVenta: null,
      codigoVendedor: null, nombreVendedor: null, codigosAlmacen: ['BSPS03'],
      nombresBodega: null, fechaHoraPedido: null, codigoEstadoVenta: null,
      codigoSincronizacion: null, articulos: [],
    };
    notificaciones.procesarRespuesta([], filtros, true);
    notificaciones.procesarRespuesta([nuevo], filtros, false);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.contador-notificaciones')?.textContent.trim())
      .toBe('1');

    await TestBed.inject(Router).navigateByUrl('/historial-validados');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.contador-notificaciones')?.textContent.trim())
      .toBe('1');

    (fixture.nativeElement.querySelector('.campana-notificaciones') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(notificaciones.noLeidos()).toBe(1);
    expect(fixture.nativeElement.querySelector('.panel-notificaciones').classList).toContain('abierto');
    expect(fixture.nativeElement.querySelector('.notificacion-pedido')).not.toBeNull();

    (fixture.nativeElement.querySelector('.limpiar-notificaciones') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(notificaciones.noLeidos()).toBe(0);
    expect(fixture.nativeElement.querySelector('.contador-notificaciones')).toBeNull();
    expect(fixture.nativeElement.querySelector('.notificaciones-vacias')).not.toBeNull();
  });

  it('abre el detalle del pedido al pulsar una notificación', () => {
    const fixture = TestBed.createComponent(App);
    const notificaciones = TestBed.inject(PedidosNotificacionesService);
    const router = TestBed.inject(Router);
    const navegar = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const filtros = { pagina: 1 as const, cantidadPorPagina: 25 as const };
    const nuevo = {
      idOrigen: 'R1:101', origenPedido: 'R1' as const, creadoEnR1: true,
      sapDocEntry: null, folioPedido: '101', numeroPedido: '101', codigoVenta: null,
      codigoVendedor: null, nombreVendedor: 'SPS Venta de Tienda', codigosAlmacen: ['BSPS03'],
      nombresBodega: null, fechaHoraPedido: '2026-09-10T10:15:00', codigoEstadoVenta: null,
      codigoSincronizacion: null, articulos: [],
    };
    notificaciones.procesarRespuesta([], filtros, true);
    notificaciones.procesarRespuesta([nuevo], filtros, false);
    fixture.detectChanges();

    (fixture.nativeElement.querySelector('.campana-notificaciones') as HTMLButtonElement).click();
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('.notificacion-pedido') as HTMLButtonElement).click();

    expect(navegar).toHaveBeenCalledWith(['/pedidos', 'R1:101'], {
      queryParams: { retorno: '/pedidos', codigoAlmacen: ['BSPS03'] },
    });
    expect(fixture.componentInstance.panelNotificacionesAbierto()).toBe(false);
  });

  it('cierra el panel al volver a pulsar la campana o al pulsar fuera', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const campana = fixture.nativeElement.querySelector('.campana-notificaciones') as HTMLButtonElement;

    campana.click();
    expect(fixture.componentInstance.panelNotificacionesAbierto()).toBe(true);
    campana.click();
    expect(fixture.componentInstance.panelNotificacionesAbierto()).toBe(false);

    campana.click();
    document.body.click();
    expect(fixture.componentInstance.panelNotificacionesAbierto()).toBe(false);
  });

  it('permite activar y desactivar el sonido desde el encabezado', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const boton = fixture.nativeElement.querySelector(
      '.control-sonido-notificaciones',
    ) as HTMLButtonElement;

    expect(boton.getAttribute('aria-label')).toBe('Desactivar sonido de notificaciones');
    expect(boton.getAttribute('aria-pressed')).toBe('true');
    expect(boton.querySelector('.pi-volume-up')).not.toBeNull();

    boton.click();
    fixture.detectChanges();

    expect(boton.getAttribute('aria-label')).toBe('Activar sonido de notificaciones');
    expect(boton.getAttribute('aria-pressed')).toBe('false');
    expect(boton.querySelector('.pi-volume-up')).not.toBeNull();
    expect(boton.querySelector('.marca-sonido-silenciado.pi-times')).not.toBeNull();
    expect(window.localStorage.getItem('pedidos-bodega:sonido-notificaciones')).toBe('0');
  });
});
