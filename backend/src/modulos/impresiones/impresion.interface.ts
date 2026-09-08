export interface IdentidadArticuloImpresion {
  idOrigen: string;
  identificadorDetalle: string;
}

export interface EstadoImpresionArticulo extends IdentidadArticuloImpresion {
  cantidadImpresiones: number;
  ultimaImpresionEn: Date;
}
