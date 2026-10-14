export function esUsuarioBod(nombreUsuario: string | null | undefined): boolean {
  return nombreUsuario?.trim().toLocaleLowerCase('es').includes('bod') ?? false;
}

export function puedeAsignarPedidos(codigoRol: string | null, nombreUsuario: string): boolean {
  if (codigoRol?.toUpperCase() === 'DASHBOARDS') return false;
  return codigoRol?.toUpperCase() === 'ADMINISTRADOR'
    || esUsuarioBod(nombreUsuario)
    || ['gcruz', 'acalix', 'jlara', 'tlopez'].includes(nombreUsuario.trim().toLowerCase());
}

export function puedeReasignarPedidos(codigoRol: string | null, nombreUsuario: string): boolean {
  return puedeAsignarPedidos(codigoRol, nombreUsuario);
}
