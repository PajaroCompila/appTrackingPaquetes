import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, type UrlTree } from '@angular/router';
import { routes } from '../../app.routes';
import type { UsuarioSesion } from './autenticacion.interface';
import { administradorGuard, dashboardGuard } from './autenticacion.guard';
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

  it('DASHBOARDS accede a las ventanas y no a configuracion de usuarios', () => {
    usuario.set({usuarioId:'1',nombreUsuario:'mkt1',nombreVisible:'Marketing',codigoRol:'DASHBOARDS',codigoAlmacen:null,debeCambiarContrasena:false});
    expect(TestBed.runInInjectionContext(() => dashboardGuard())).toBe(true);
    expect(TestBed.runInInjectionContext(() => administradorGuard())).not.toBe(true);
    const restringidas = routes.filter(r => r.canActivate?.includes(administradorGuard));
    expect(restringidas.map(r => r.path)).toEqual(['configuracion/usuarios']);
  });

  it('CONSULTA no puede abrir dashboard ni administrar usuarios', () => {
    usuario.set({usuarioId:'2',nombreUsuario:'consulta',nombreVisible:'Consulta',codigoRol:'CONSULTA',codigoAlmacen:null,debeCambiarContrasena:false});
    const resultado = TestBed.runInInjectionContext(() => dashboardGuard()) as UrlTree;
    expect(TestBed.inject(Router).serializeUrl(resultado)).toBe('/pedidos');
    expect(TestBed.runInInjectionContext(() => administradorGuard())).not.toBe(true);
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
