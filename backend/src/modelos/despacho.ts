export interface Despacho {
  despachoId: number; placa: string; conductor: string; puntoOrigenId: number; puntoOrigen: string;
  puntoDestinoId: number; puntoDestino: string; usuarioDespachaId: number; nombreUsuario: string;
  estado: 'despachado' | 'recibido'; fechaSalida: Date; fechaRecepcion: Date | null; guias: string;
}
export interface DatosDespacho { placa: string; conductor: string; puntoDestinoId: number; envioIds: number[]; }
