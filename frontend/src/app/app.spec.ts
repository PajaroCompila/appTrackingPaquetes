import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Aplicacion } from './app';
import { ServicioSesion } from './servicios/sesion.service';

describe('Aplicacion', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Aplicacion],
      providers: [provideHttpClient()],
    }).compileComponents();
  });

  it('debe crear la aplicación', () => {
    const componente = TestBed.createComponent(Aplicacion).componentInstance;
    expect(componente).toBeTruthy();
  });

  it('debe mostrar el seguimiento en la portada', async () => {
    const vista = TestBed.createComponent(Aplicacion);
    await vista.whenStable();
    const contenido = vista.nativeElement as HTMLElement;
    expect(contenido.querySelector('h1')?.textContent).toContain('Seguimiento de');
    expect(contenido.querySelector('input[name="guiaPortada"]')).toBeTruthy();
  });

  it('debe solicitar usuario y contraseña antes de abrir el panel', async () => {
    const vista = TestBed.createComponent(Aplicacion);
    await vista.whenStable();
    const botonIngreso = vista.nativeElement.querySelector(
      '.portada-encabezado nav button',
    ) as HTMLButtonElement;
    botonIngreso.click();
    vista.detectChanges();
    const contenido = vista.nativeElement as HTMLElement;
    expect(contenido.textContent).toContain('Inicia sesión');
    expect(contenido.querySelector('input[type="text"]')).toBeTruthy();
    expect(contenido.querySelector('input[type="password"]')).toBeTruthy();
  });

  it('debe mostrar usuarios a un Supervisor', () => {
    const sesion = TestBed.inject(ServicioSesion);
    const vista = TestBed.createComponent(Aplicacion);
    vista.detectChanges();
    (
      vista.nativeElement.querySelector('.portada-encabezado nav button') as HTMLButtonElement
    ).click();
    sesion.usuario.set({ usuarioId: 2, nombreUsuario: 'supervisor', rol: 'supervisor', sucursalId: 1 });
    vista.detectChanges();
    expect((vista.nativeElement as HTMLElement).textContent).toContain('Usuarios');
  });

  it('debe mostrar el nombre del usuario que inició sesión', () => {
    const sesion = TestBed.inject(ServicioSesion);
    const vista = TestBed.createComponent(Aplicacion);
    sesion.usuario.set({ usuarioId: 4, nombreUsuario: 'gvarela', rol: 'supervisor', sucursalId: 1 });
    vista.detectChanges();
    const identidad = vista.nativeElement.querySelector('.usuario') as HTMLElement;
    expect(identidad.querySelector('strong')?.textContent?.trim()).toBe('gvarela');
    expect(identidad.querySelector('span')?.textContent?.trim()).toBe('Supervisor');
  });

  it('debe ocultar usuarios a un Usuario', () => {
    const sesion = TestBed.inject(ServicioSesion);
    const vista = TestBed.createComponent(Aplicacion);
    vista.detectChanges();
    (
      vista.nativeElement.querySelector('.portada-encabezado nav button') as HTMLButtonElement
    ).click();
    sesion.usuario.set({ usuarioId: 1, nombreUsuario: 'operador', rol: 'usuario', sucursalId: 1 });
    vista.detectChanges();
    expect((vista.nativeElement as HTMLElement).textContent).not.toContain('Usuarios');
  });
});
