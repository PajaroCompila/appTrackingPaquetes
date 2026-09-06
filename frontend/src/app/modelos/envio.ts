import type { Sucursal } from './sucursal';

export type EstadoEnvio = 'registrado' | 'en_transito' | 'recibido' | 'cancelado';
export interface Envio {
  envioId: number;
  numeroGuia: string;
  puntoOrigenId: number;
  puntoOrigen: string;
  puntoDestinoId: number;
  puntoDestino: string;
  usuarioQueRegistraId: number;
  nombreUsuario: string;
  nombreRemitente: string;
  telefonoRemitente: string;
  nombreDestinatario: string;
  telefonoDestinatario: string;
  descripcion: string;
  cantidadPaquetes: number;
  estadoActual: EstadoEnvio;
  fechaCreacion: string;
}
export type DatosEnvio = Omit<
  Envio,
  'envioId' | 'numeroGuia' | 'usuarioQueRegistraId' | 'nombreUsuario' | 'puntoOrigen' | 'puntoDestino' | 'estadoActual' | 'fechaCreacion'
>;
export type ActualizacionEnvio = DatosEnvio & { estadoActual: EstadoEnvio };
export type SeguimientoEnvio = Pick<
  Envio,
  'numeroGuia' | 'puntoOrigen' | 'puntoDestino' | 'descripcion' | 'cantidadPaquetes' | 'estadoActual' | 'fechaCreacion'
>;
export type SucursalEnvio = Pick<Sucursal, 'sucursalId' | 'nombre' | 'codigo'>;
