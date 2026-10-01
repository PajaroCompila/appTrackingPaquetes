export function esLineaFlete(
  codigoArticulo: string | null | undefined,
  descripcion: string | null | undefined,
): boolean {
  return `${codigoArticulo ?? ''}\u0000${descripcion ?? ''}`.toLocaleUpperCase('es-HN').includes('FLETE');
}

export function condicionLineaNoFleteSql(
  expresionCodigo: string,
  expresionDescripcion: string,
): string {
  return `(UPPER(ISNULL(${expresionCodigo}, '')) NOT LIKE '%FLETE%'
    AND UPPER(ISNULL(${expresionDescripcion}, '')) NOT LIKE '%FLETE%')`;
}
