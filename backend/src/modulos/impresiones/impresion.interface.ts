export interface IdentidadArticuloImpresion {
  idOrigen: string;
  identificadorDetalle: string;
}

export interface EstadoImpresionArticulo extends IdentidadArticuloImpresion {
  cantidadImpresiones: number;
  ultimaImpresionEn: Date;
  ultimaImpresionPorUsuarioId?: string | null;
  ultimaImpresionPor?: string | null;
}

export interface LineaRegistroImpresion extends IdentidadArticuloImpresion {
  codigoArticulo: string | null;
}
