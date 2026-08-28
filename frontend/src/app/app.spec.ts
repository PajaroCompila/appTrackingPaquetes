import { signal, type WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { App } from './app';
import { routes } from './app.routes';
import type { UsuarioSesion } from './funcionalidades/autenticacion/autenticacion.interface';
import { AutenticacionService } from './funcionalidades/autenticacion/autenticacion.service';

describe('App', () => {
  let usuario: WritableSignal<UsuarioSesion | null>;

  beforeEach(async () => {
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
      ],
    }).compileComponents();
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

    expect(enlaces).toHaveLength(3);
    expect(enlaces.map((enlace) => enlace.getAttribute('aria-label'))).toEqual([
      'Pedidos pendientes',
      'Pedidos despachados',
      'Historial',
    ]);
    expect(enlaces.map((enlace) => enlace.getAttribute('href'))).toEqual([
      '/pedidos',
      '/pedidos-despachados',
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

    expect(router.url).toBe('/pedidos-despachados');
    expect(enlace.classList.contains('activo')).toBe(true);
    expect(fixture.nativeElement.querySelector('h1')?.textContent).toBe('Pedidos despachados');
  });
});
