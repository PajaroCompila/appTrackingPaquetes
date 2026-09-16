export interface EntregaSapPublica {
  empresa: string;
  objType: 15;
  docEntry: number;
  docNum: string;
  tipo: string;
  fechaEntrega: string;
  referenciaR1: string | null;
  bases: { baseType: number; baseEntry: number | null; baseLine: number | null; numeroDocumento: string | null }[];
  facturas: { docEntry: number; docNum: string }[];
}
export interface AuditoriaEntregaSap {
  usuarioRegistrador: string | null;
  nombreRegistrador: string | null;
  documentoEntrega: string;
  fechaEntrega: string;
}
export type EstadoEntregaSap = 'Entregado, Sin factura' | 'Facturado';
