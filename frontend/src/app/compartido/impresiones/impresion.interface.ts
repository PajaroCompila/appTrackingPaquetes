export interface IdentidadArticuloImpresion {
  idOrigen: string;
  identificadorDetalle: string;
}

export interface EstadoImpresionArticulo extends IdentidadArticuloImpresion {
  cantidadImpresiones: number;
  ultimaImpresionEn: string;
  ultimaImpresionPorUsuarioId?: string | null;
  ultimaImpresionPor?: string | null;
}

export interface LineaRegistroImpresion extends IdentidadArticuloImpresion {
  codigoArticulo: string | null;
}

export function claveArticuloImpreso(linea: IdentidadArticuloImpresion): string {
  return `${linea.idOrigen}\u0000${linea.identificadorDetalle}`;
}
