export const GRUPOS_CLIENTE_SAP_PERMITIDOS = Object.freeze(
  Array.from({ length: 19 }, (_, indice) => 100 + indice),
);

export const GRUPOS_CLIENTE_SAP_PERMITIDOS_SQL =
  GRUPOS_CLIENTE_SAP_PERMITIDOS.join(', ');

export function esGrupoClienteSapPermitido(grupo: number | null | undefined): boolean {
  return grupo !== null
    && grupo !== undefined
    && GRUPOS_CLIENTE_SAP_PERMITIDOS.includes(grupo);
}
