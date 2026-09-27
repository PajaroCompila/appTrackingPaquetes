import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, type UrlTree } from '@angular/router';
import { routes } from '../../app.routes';
import type { UsuarioSesion } from './autenticacion.interface';
import { dashboardGuard, accesoOperativoGuard, administradorGuard } from './autenticacion.guard';
import { AutenticacionService } from './autenticacion.service';

describe('administradorGuard', () => {
  const usuario = signal<UsuarioSesion | null>(null);

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AutenticacionService, useValue: { usuario } },
      ],
    });
  });

  it('redirige el rol DASHBOARDS y protege los modulos operativos', () => {
    usuario.set({ usuarioId: '1', nombreUsuario: 'consulta_dashboard', nombreVisible: 'Marketing',
      codigoRol: 'DASHBOARDS', codigoAlmacen: null, debeCambiarContrasena: false });
    const resultado = TestBed.runInInjectionContext(() => accesoOperativoGuard()) as UrlTree;
    expect(TestBed.inject(Router).serializeUrl(resultado)).toBe('/dashboard');
    expect(TestBed.runInInjectionContext(() => dashboardGuard())).toBe(true);
    const operativas = routes.filter(r => r.loadComponent && !['login', 'cambiar-contrasena'].includes(r.path!) && !r.path?.startsWith('dashboard'));
    expect(operativas.every(r => r.canActivate?.includes(accesoOperativoGuard))).toBe(true);
  });

  it('permite ingresar al administrador', () => {
    usuario.set({ usuarioId: '1', nombreUsuario: 'admin', nombreVisible: 'Administrador',
      codigoRol: 'ADMINISTRADOR', codigoAlmacen: null, debeCambiarContrasena: false });

    expect(TestBed.runInInjectionContext(() => administradorGuard())).toBe(true);
  });

  it.each(['OPERADOR_BODEGA', 'CONSULTA'] as const)(
    'redirige a pedidos al rol %s',
    (codigoRol) => {
      usuario.set({ usuarioId: '1', nombreUsuario: 'usuario', nombreVisible: 'Usuario',
        codigoRol, codigoAlmacen: null, debeCambiarContrasena: false });

      const resultado = TestBed.runInInjectionContext(() => administradorGuard()) as UrlTree;
      expect(TestBed.inject(Router).serializeUrl(resultado)).toBe('/pedidos');
    },
  );

  it('protege tanto el dashboard general como su detalle por sucursal', () => {
    const rutasDashboard = routes.filter(({ path }) => path?.startsWith('dashboard'));

    expect(rutasDashboard).toHaveLength(2);
    expect(rutasDashboard.every(({ canActivate }) => canActivate?.includes(dashboardGuard))).toBe(true);
  });
});
