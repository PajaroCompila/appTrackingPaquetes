import type { Envio } from './envio';

export interface Despacho {
  despachoId: number;
  placa: string;
  conductor: string;
  puntoOrigenId: number;
  puntoOrigen: string;
  puntoDestinoId: number;
  puntoDestino: string;
  usuarioDespachaId: number;
  nombreUsuario: string;
  estado: 'despachado' | 'recibido';
  fechaSalida: string;
  fechaRecepcion: string | null;
  guias: string;
}

export interface DatosDespacho {
  placa: string;
  conductor: string;
  puntoDestinoId: number;
  envioIds: number[];
}

export type PaqueteParaDespacho = Envio;
