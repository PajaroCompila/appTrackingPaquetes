import type { UsuarioSesion } from './autenticacion.interface';

export interface PermisosRol {
  verDashboard: boolean;
  administrarUsuarios: boolean;
  verOperacion: boolean;
  verNotificaciones: boolean;
  soloConsultaOperativa: boolean;
  registrarImpresiones: boolean;
}

export function obtenerPermisosRol(
  codigoRol: UsuarioSesion['codigoRol'] | undefined,
): PermisosRol {
  const esAdministrador = codigoRol === 'ADMINISTRADOR';
  const esDashboards = codigoRol === 'DASHBOARDS';
  const esInventario = codigoRol === 'INVENTARIO';
  return {
    verDashboard: esAdministrador || esDashboards,
    administrarUsuarios: esAdministrador,
    verOperacion: !esInventario,
    verNotificaciones: !esInventario,
    soloConsultaOperativa: esDashboards || esInventario,
    registrarImpresiones: !esDashboards && !esInventario,
  };
}

export function rutaInicialRol(codigoRol: UsuarioSesion['codigoRol'] | undefined): string {
  return codigoRol === 'INVENTARIO' ? '/inventario' : '/pedidos';
}
