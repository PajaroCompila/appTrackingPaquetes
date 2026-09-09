import type { IdentidadAutenticada } from '../autenticacion/autenticacion.interface.js';

export type IdentidadConAlmacenes = Pick<IdentidadAutenticada, 'codigoRol' | 'codigosAlmacenVisibles'>;

export function restringirCodigosAlmacen(
  usuario: IdentidadConAlmacenes | undefined,
  solicitados: readonly string[],
): string[] {
  if (!usuario) return [...solicitados];
  const permitidos = usuario.codigosAlmacenVisibles ?? [];
  if (usuario.codigoRol?.toUpperCase() === 'ADMINISTRADOR' || permitidos.length === 0) {
    return [...solicitados];
  }
  const conjunto = new Set(permitidos.map((codigo) => codigo.toUpperCase()));
  if (solicitados.length === 0) return [...permitidos];
  const autorizados = solicitados.filter((codigo) => conjunto.has(codigo.toUpperCase()));
  return autorizados.length > 0 ? autorizados : ['SIN_ACCESO'];
}

export function puedeVerAlmacen(usuario: IdentidadConAlmacenes | undefined, codigoAlmacen: string | null): boolean {
  if (!usuario || !codigoAlmacen || usuario.codigoRol?.toUpperCase() === 'ADMINISTRADOR'
    || (usuario.codigosAlmacenVisibles ?? []).length === 0) return true;
  return (usuario.codigosAlmacenVisibles ?? []).some((codigo) =>
    codigo.toUpperCase() === codigoAlmacen.toUpperCase());
}
