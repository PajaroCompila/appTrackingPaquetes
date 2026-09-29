import type { UsuarioSesion } from './autenticacion.interface';

export interface PermisosRol {
  verDashboard: boolean;
  administrarUsuarios: boolean;
  soloConsultaOperativa: boolean;
  registrarImpresiones: boolean;
}

export function obtenerPermisosRol(
  codigoRol: UsuarioSesion['codigoRol'] | undefined,
): PermisosRol {
  const esAdministrador = codigoRol === 'ADMINISTRADOR';
  const esDashboards = codigoRol === 'DASHBOARDS';
  return {
    verDashboard: esAdministrador || esDashboards,
    administrarUsuarios: esAdministrador,
    soloConsultaOperativa: esDashboards,
    registrarImpresiones: !esDashboards,
  };
}
