export type EstadoEntregaSap = 'Entregado, Sin factura' | 'Facturado';

export interface ReferenciaBaseEntregaSap {
  baseType: number;
  baseEntry: number | null;
  baseLine: number | null;
  numeroDocumento: string | null;
}

export interface EntregaSapPublica {
  empresa: string;
  objType: 15;
  docEntry: number;
  docNum: string;
  tipo: string;
  fechaEntrega: string;
  referenciaR1: string | null;
  bases: ReferenciaBaseEntregaSap[];
  facturas: { docEntry: number; docNum: string }[];
}

export interface AuditoriaEntregaSap {
  usuarioRegistrador: string | null;
  nombreRegistrador: string | null;
  documentoEntrega: string;
  fechaEntrega: string;
}

export interface LineaEntregaSap {
  lineNum: number;
  itemCode: string;
  descripcion: string | null;
  quantity: number;
  invQty: number;
  whsCode: string;
  nombreAlmacen: string | null;
  baseType: number;
  baseEntry: number | null;
  baseLine: number | null;
  numeroBase: string | null;
  folioBaseR1?: string | null;
  partidaBaseR1?: number | null;
  baseCreadaEnR1?: string | null;
  itemBase?: string | null;
  almacenBase?: string | null;
  cantidadBase?: number | null;
  invQtyBase?: number | null;
  salidaComprobada: number;
  cantidadEntregada: number;
}

export interface EntregaSapPersistida {
  idOrigen: string;
  empresa: string;
  objType: 15;
  docEntry: number;
  docNum: string;
  docDate: string;
  docTime: number;
  createDate: string;
  createTS: number;
  updateDate: string;
  updateTS: number;
  fechaEntrega: string;
  canceled: string;
  docStatus: string;
  nombreVendedor: string | null;
  referenciaR1: string | null;
  userSign: number | null;
  usuarioRegistrador: string | null;
  nombreRegistrador: string | null;
  estadoLogistico: 'SALIDA_COMPROBADA' | 'SIN_SALIDA' | 'CANCELADA';
  estadoFinanciero: EstadoEntregaSap;
  facturas: { docEntry: number; docNum: string; baseLine: number; cantidad: number }[];
  lineas: LineaEntregaSap[];
}

export const EMPRESA_ENTREGA_SAP = 'PAJARO_AZUL';
export function identidadEntregaSap(docEntry: number): string {
  return `SAP:${EMPRESA_ENTREGA_SAP}:15:${docEntry}`;
}
export function esIdentidadEntregaSap(id: string): boolean {
  return /^SAP:PAJARO_AZUL:15:[1-9]\d*$/.test(id);
}
