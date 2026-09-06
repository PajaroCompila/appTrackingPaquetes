import type { IdentidadAutenticada } from "./usuario.js";

export type EstadoEnvio = "registrado" | "en_transito" | "recibido" | "cancelado";

export interface RecepcionEnvio { recepcionId: number; envioId: number; numeroGuia: string; usuarioRecibeId: number; nombreUsuario: string; entregaFinal: boolean; fechaRecepcion: Date; }
export interface DatosRecepcion { envioId: number; usuarioRecibeId: number; }

export interface Envio {
  envioId: number;
  numeroGuia: string;
  puntoOrigenId: number;
  puntoOrigen: string;
  puntoDestinoId: number;
  puntoDestino: string;
  usuarioQueRegistraId: number;
  nombreRemitente: string;
  telefonoRemitente: string;
  nombreDestinatario: string;
  telefonoDestinatario: string;
  descripcion: string;
  cantidadPaquetes: number;
  estadoActual: EstadoEnvio;
  fechaCreacion: Date;
}

export type DatosEnvio = Omit<Envio, "envioId" | "numeroGuia" | "usuarioQueRegistraId" | "puntoOrigen" | "puntoDestino" | "estadoActual" | "fechaCreacion">;
export type ActualizacionEnvio = DatosEnvio & { estadoActual: EstadoEnvio };
export type SeguimientoEnvio = Pick<
  Envio,
  "numeroGuia" | "puntoOrigen" | "puntoDestino" | "descripcion" | "cantidadPaquetes" | "estadoActual" | "fechaCreacion"
>;
export type AlcanceEnvios = IdentidadAutenticada;
