export interface ErrorApi {
  codigo?: string;
  mensaje?: string;
  idSeguimiento?: string;
}

export interface MensajeError {
  titulo: string;
  detalle: string;
  idSeguimiento?: string;
}

