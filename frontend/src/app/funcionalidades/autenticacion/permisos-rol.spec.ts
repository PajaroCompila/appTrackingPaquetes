import { describe, expect, it } from 'vitest';
import { obtenerPermisosRol } from './permisos-rol';

describe('permisos por rol', () => {
  it('CONSULTA no ve Dashboard y conserva acceso operativo', () => {
    expect(obtenerPermisosRol('CONSULTA')).toEqual({
      verDashboard: false,
      administrarUsuarios: false,
      verOperacion: true,
      verNotificaciones: true,
      soloConsultaOperativa: false,
      registrarImpresiones: true,
    });
  });

  it('DASHBOARDS ve Dashboard pero nunca registra cambios ni impresiones', () => {
    expect(obtenerPermisosRol('DASHBOARDS')).toEqual({
      verDashboard: true,
      administrarUsuarios: false,
      verOperacion: true,
      verNotificaciones: true,
      soloConsultaOperativa: true,
      registrarImpresiones: false,
    });
  });

  it('mantiene permisos completos del administrador', () => {
    expect(obtenerPermisosRol('ADMINISTRADOR')).toEqual({
      verDashboard: true,
      administrarUsuarios: true,
      verOperacion: true,
      verNotificaciones: true,
      soloConsultaOperativa: false,
      registrarImpresiones: true,
    });
  });

  it('INVENTARIO solo conserva acceso de lectura al inventario', () => {
    expect(obtenerPermisosRol('INVENTARIO')).toEqual({
      verDashboard: false,
      administrarUsuarios: false,
      verOperacion: false,
      verNotificaciones: false,
      soloConsultaOperativa: true,
      registrarImpresiones: false,
    });
  });
});
