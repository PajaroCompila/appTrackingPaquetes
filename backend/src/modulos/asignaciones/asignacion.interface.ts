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
  actualizadoEn: Date | null;
}
