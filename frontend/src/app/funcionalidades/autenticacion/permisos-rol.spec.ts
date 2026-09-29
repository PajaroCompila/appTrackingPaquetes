import { describe, expect, it } from 'vitest';
import { obtenerPermisosRol } from './permisos-rol';

describe('permisos por rol', () => {
  it('CONSULTA no ve Dashboard y conserva acceso operativo', () => {
    expect(obtenerPermisosRol('CONSULTA')).toEqual({
      verDashboard: false,
      administrarUsuarios: false,
      soloConsultaOperativa: false,
      registrarImpresiones: true,
    });
  });

  it('DASHBOARDS ve Dashboard pero nunca registra cambios ni impresiones', () => {
    expect(obtenerPermisosRol('DASHBOARDS')).toEqual({
      verDashboard: true,
      administrarUsuarios: false,
      soloConsultaOperativa: true,
      registrarImpresiones: false,
    });
  });

  it('mantiene permisos completos del administrador', () => {
    expect(obtenerPermisosRol('ADMINISTRADOR')).toEqual({
      verDashboard: true,
      administrarUsuarios: true,
      soloConsultaOperativa: false,
      registrarImpresiones: true,
    });
  });
});
