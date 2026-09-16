import { createHash } from 'node:crypto';

export interface ReferenciaLineaR1 {
  folioBaseR1?: string | null;
  partidaBaseR1?: number | null;
  tipoBaseR1?: string | null;
  lineaSapR1?: number | null;
  factorInventarioR1?: number | null;
  unidadInventarioR1?: string | null;
}

// Solo amplía la lectura normal de la partida; no consulta SAP ni otras líneas.
export const COLUMNAS_REFERENCIA_LINEA_R1 = `
  detalle.U_SO1_DOCUMENTOBASE AS folioBaseR1,
  detalle.U_SO1_PARTIDABASE AS partidaBaseR1,
  detalle.U_SO1_TIPODOCBASE AS tipoBaseR1,
  detalle.U_SO1_PARTIDASBO AS lineaSapR1,
  detalle.U_SO1_CANTUNIMEDINV AS factorInventarioR1,
  detalle.U_SO1_CODIUNIMEDINV AS unidadInventarioR1`;

export function firmaLineaR1(ref: ReferenciaLineaR1, item: string | null,
  almacen: string | null, cantidad: number | null): string {
  return createHash('sha256').update(JSON.stringify([
    item?.trim() ?? null, almacen?.trim() ?? null, cantidad,
    ref.folioBaseR1?.trim() || null, ref.partidaBaseR1 ?? null,
    ref.tipoBaseR1?.trim() || null, ref.lineaSapR1 ?? null,
    ref.factorInventarioR1 ?? null, ref.unidadInventarioR1?.trim() || null,
  ])).digest('hex');
}
