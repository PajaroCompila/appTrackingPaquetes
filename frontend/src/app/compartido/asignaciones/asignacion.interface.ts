export interface IdentidadArticuloAsignacion {
  idOrigen: string;
  identificadorDetalle: string;
}

export interface TecnicoAsignable {
  usuario: string;
  nombre: string;
}

export interface AsignacionArticulo extends IdentidadArticuloAsignacion {
  usuarioAsignado: string | null;
  nombreAsignado: string | null;
  actualizadoEn: string | null;
}

export function claveArticuloAsignado(linea: IdentidadArticuloAsignacion): string {
  return `${linea.idOrigen}\u0000${linea.identificadorDetalle}`;
}
