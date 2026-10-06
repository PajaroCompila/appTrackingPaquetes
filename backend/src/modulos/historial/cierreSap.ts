export type TipoCierreSap =
  | 'CERRADO CON ENTREGA'
  | 'CERRADO CON FACTURA DIRECTA'
  | 'CERRADO CON FACTURA VIA ENTREGA'
  | 'CERRADO SIN ENTREGA NI FACTURA';

export interface EvidenciaCierreSap {
  tieneEntrega: boolean;
  tieneFacturaDirecta: boolean;
  tieneFacturaViaEntrega: boolean;
  tipoCierre: TipoCierreSap;
}

export function clasificarCierreSap(
  tieneEntrega: boolean,
  tieneFacturaDirecta: boolean,
  tieneFacturaViaEntrega = false,
): TipoCierreSap {
  if (tieneFacturaDirecta) return 'CERRADO CON FACTURA DIRECTA';
  if (tieneFacturaViaEntrega) return 'CERRADO CON FACTURA VIA ENTREGA';
  if (tieneEntrega) return 'CERRADO CON ENTREGA';
  return 'CERRADO SIN ENTREGA NI FACTURA';
}

export function columnasEvidenciaCierreSap(aliasPedido: string): string {
  return `CASE WHEN EXISTS (
      SELECT 1
      FROM dbo.[DLN1] lineaEntrega
      INNER JOIN dbo.[ODLN] entrega
        ON entrega.[DocEntry] = lineaEntrega.[DocEntry]
      WHERE lineaEntrega.[BaseType] = 17
        AND lineaEntrega.[BaseEntry] = ${aliasPedido}.[DocEntry]
        AND entrega.[CANCELED] = 'N'
    ) THEN 1 ELSE 0 END AS tieneEntrega,
    CASE WHEN EXISTS (
      SELECT 1
      FROM dbo.[INV1] lineaFactura
      INNER JOIN dbo.[OINV] factura
        ON factura.[DocEntry] = lineaFactura.[DocEntry]
      WHERE lineaFactura.[BaseType] = 17
        AND lineaFactura.[BaseEntry] = ${aliasPedido}.[DocEntry]
        AND factura.[CANCELED] = 'N'
    ) THEN 1 ELSE 0 END AS tieneFacturaDirecta,
    CASE WHEN EXISTS (
      SELECT 1
      FROM dbo.[DLN1] lineaEntrega
      INNER JOIN dbo.[ODLN] entrega
        ON entrega.[DocEntry] = lineaEntrega.[DocEntry]
      INNER JOIN dbo.[INV1] lineaFactura
        ON lineaFactura.[BaseType] = 15
       AND lineaFactura.[BaseEntry] = entrega.[DocEntry]
      INNER JOIN dbo.[OINV] factura
        ON factura.[DocEntry] = lineaFactura.[DocEntry]
      WHERE lineaEntrega.[BaseType] = 17
        AND lineaEntrega.[BaseEntry] = ${aliasPedido}.[DocEntry]
        AND entrega.[CANCELED] = 'N'
        AND factura.[CANCELED] = 'N'
    ) THEN 1 ELSE 0 END AS tieneFacturaViaEntrega`;
}
