import sql from 'mssql';
import { consultarSap } from '../../infraestructura/sql/consultaSap.js';
import { obtenerPoolSap } from '../../infraestructura/sql/conexionSap.js';
import { fechaSqlSinZona } from '../../compartido/fechaSql.js';
import { GRUPOS_CLIENTE_SAP_PERMITIDOS_SQL } from '../pedidos/gruposClienteSap.js';
import { EMPRESA_ENTREGA_SAP, identidadEntregaSap, type EntregaSapPersistida } from './entregaSap.interface.js';

export interface FilaEntregaSap {
  docEntry: number; docNum: number; docDate: Date; docTime: number;
  createDate: Date; createTS: number; updateDate: Date; updateTS: number;
  canceled: string; docStatus: string; nombreVendedor: string | null;
  referenciaR1: string | null; userSign: number | null;
  usuarioRegistrador: string | null; nombreRegistrador: string | null;
  lineNum: number; itemCode: string; descripcion: string | null;
  quantity: number; invQty: number; whsCode: string; nombreAlmacen: string | null;
  baseType: number; baseEntry: number | null; baseLine: number | null; numeroBase: number | null;
  folioBaseR1?: string | null; partidaBaseR1?: number | null; baseCreadaEnR1?: string | null;
  itemBase?: string | null; almacenBase?: string | null;
  cantidadBase?: number | null; invQtyBase?: number | null;
}
export interface FilaMovimientoEntregaSap {
  docEntry: number; lineNum: number; itemCode: string; whsCode: string; salida: number;
}
export interface FilaFacturaEntregaSap {
  entregaDocEntry: number; docEntry: number; docNum: number; baseLine: number; cantidad: number;
}

function fechaHora(fecha: Date, tiempo: number, segundos = false): string {
  const texto = String(tiempo ?? 0).padStart(segundos ? 6 : 4, '0');
  return `${fechaSqlSinZona(fecha)!.slice(0, 10)}T${texto.slice(0, 2)}:${texto.slice(2, 4)}:${segundos ? texto.slice(4, 6) : '00'}`;
}

export function construirEntregasSap(
  filas: FilaEntregaSap[], movimientos: FilaMovimientoEntregaSap[], facturas: FilaFacturaEntregaSap[],
): EntregaSapPersistida[] {
  const salidas = new Map(movimientos.map(m => [
    `${m.docEntry}:${m.lineNum}:${m.itemCode}:${m.whsCode}`, Number(m.salida),
  ]));
  const entregas = new Map<number, EntregaSapPersistida>();
  for (const f of filas) {
    let entrega = entregas.get(f.docEntry);
    if (!entrega) {
      entrega = {
        idOrigen: identidadEntregaSap(f.docEntry), empresa: EMPRESA_ENTREGA_SAP, objType: 15,
        docEntry: f.docEntry, docNum: String(f.docNum),
        docDate: fechaSqlSinZona(f.docDate)!, docTime: f.docTime,
        createDate: fechaSqlSinZona(f.createDate)!, createTS: f.createTS,
        updateDate: fechaSqlSinZona(f.updateDate)!, updateTS: f.updateTS,
        fechaEntrega: fechaHora(f.createDate, f.createTS, true), canceled: f.canceled, docStatus: f.docStatus,
        nombreVendedor: f.nombreVendedor, referenciaR1: f.referenciaR1?.trim() || null,
        userSign: f.userSign, usuarioRegistrador: f.usuarioRegistrador, nombreRegistrador: f.nombreRegistrador,
        estadoLogistico: f.canceled === 'N' ? 'SIN_SALIDA' : 'CANCELADA',
        estadoFinanciero: 'Entregado, Sin factura', facturas: [], lineas: [],
      };
      entregas.set(f.docEntry, entrega);
    }
    const salida = Math.max(0, salidas.get(`${f.docEntry}:${f.lineNum}:${f.itemCode}:${f.whsCode}`) ?? 0);
    const invQty = Number(f.invQty);
    const cantidadEntregada = invQty > 0 ? Math.min(salida, invQty) * Number(f.quantity) / invQty : 0;
    entrega.lineas.push({ lineNum: f.lineNum, itemCode: f.itemCode, descripcion: f.descripcion,
      quantity: Number(f.quantity), invQty, whsCode: f.whsCode, nombreAlmacen: f.nombreAlmacen,
      baseType: f.baseType, baseEntry: f.baseType === -1 ? null : f.baseEntry,
      baseLine: f.baseType === -1 ? null : f.baseLine,
      numeroBase: f.numeroBase === null ? null : String(f.numeroBase),
      folioBaseR1: f.folioBaseR1?.trim() || null, partidaBaseR1: f.partidaBaseR1 ?? null,
      baseCreadaEnR1: f.baseCreadaEnR1 ?? null, itemBase: f.itemBase ?? null,
      almacenBase: f.almacenBase ?? null, cantidadBase: f.cantidadBase ?? null,
      invQtyBase: f.invQtyBase ?? null,
      salidaComprobada: salida, cantidadEntregada });
  }
  for (const entrega of entregas.values()) {
    entrega.facturas = facturas.filter(f => f.entregaDocEntry === entrega.docEntry
      && entrega.lineas.some(l => l.lineNum === f.baseLine))
      .map(f => ({ docEntry: f.docEntry, docNum: String(f.docNum), baseLine: f.baseLine, cantidad: Number(f.cantidad) }));
    if (entrega.canceled === 'N' && entrega.lineas.some(l => l.cantidadEntregada > 0)) {
      entrega.estadoLogistico = 'SALIDA_COMPROBADA';
    }
    if (entrega.facturas.length > 0) entrega.estadoFinanciero = 'Facturado';
  }
  return [...entregas.values()];
}

export class EntregaSapFuente {
  public async descubrirFacturas(cursor: number): Promise<{ facturaDocEntry: number; entregaDocEntry: number | null }[]> {
    const resultado = await consultarSap<{ facturaDocEntry: number; entregaDocEntry: number | null }>(`
      SELECT DISTINCT f.DocEntry AS facturaDocEntry,
        CASE WHEN c.GroupCode IN (${GRUPOS_CLIENTE_SAP_PERMITIDOS_SQL})
          AND ISNULL(e.U_SO1_01RETAILONE, 'N')='N' AND e.DocType='I' THEN e.DocEntry END AS entregaDocEntry
      FROM (SELECT TOP (25) DocEntry FROM OINV WHERE DocEntry > @cursor
        ORDER BY DocEntry ${cursor === 0 ? 'DESC' : 'ASC'}) f
      LEFT JOIN INV1 l ON l.DocEntry=f.DocEntry AND l.BaseType=15
      LEFT JOIN ODLN e ON e.DocEntry=l.BaseEntry
      LEFT JOIN OCRD c ON c.CardCode=e.CardCode
    `, r => r.input('cursor', sql.Int, cursor));
    return resultado.recordset;
  }
  public async descubrir(cursor: number, limite = 50, anterior = false): Promise<number[]> {
    const resultado = await consultarSap<{ docEntry: number }>(`
      SELECT TOP (@limite) e.DocEntry AS docEntry FROM ODLN e
      INNER JOIN OCRD c ON c.CardCode = e.CardCode
      WHERE c.GroupCode IN (${GRUPOS_CLIENTE_SAP_PERMITIDOS_SQL})
        AND e.DocType = 'I'
        AND ISNULL(e.U_SO1_01RETAILONE, 'N') = 'N'
        AND e.DocEntry ${anterior ? '<' : '>'} @cursor
      ORDER BY e.DocEntry ${anterior || cursor === 0 ? 'DESC' : 'ASC'}
    `, r => r.input('cursor', sql.Int, cursor).input('limite', sql.Int, limite));
    return resultado.recordset.map(f => f.docEntry);
  }

  public async obtener(docEntries: number[]): Promise<EntregaSapPersistida[]> {
    const ids = [...new Set(docEntries)];
    if (ids.length === 0) return [];
    if (ids.length > 150) throw new Error('Lote de entregas SAP demasiado grande.');
    const parametros = ids.map((_, i) => `@id${i}`).join(',');
    const configurar = (r: sql.Request) => {
      ids.forEach((id, i) => r.input(`id${i}`, sql.Int, id));
      return r;
    };
    await obtenerPoolSap();
    const [documentos, movimientos, facturas] = await Promise.all([
      consultarSap<FilaEntregaSap>(`
        SELECT e.DocEntry AS docEntry, e.DocNum AS docNum, e.DocDate AS docDate, e.DocTime AS docTime,
          e.CreateDate AS createDate, e.CreateTS AS createTS, e.UpdateDate AS updateDate, e.UpdateTS AS updateTS,
          e.CANCELED AS canceled, e.DocStatus AS docStatus, v.SlpName AS nombreVendedor,
          e.U_SO1_01FOLIORETAIL1 AS referenciaR1, e.UserSign AS userSign,
          u.USER_CODE AS usuarioRegistrador, u.U_NAME AS nombreRegistrador,
          l.LineNum AS lineNum, l.ItemCode AS itemCode, l.Dscription AS descripcion,
          l.Quantity AS quantity, l.InvQty AS invQty, l.WhsCode AS whsCode, w.WhsName AS nombreAlmacen,
          l.BaseType AS baseType, l.BaseEntry AS baseEntry, l.BaseLine AS baseLine,
          CASE WHEN l.BaseType = 17 THEN p.DocNum WHEN l.BaseType = 23 THEN q.DocNum END AS numeroBase,
          CASE WHEN l.BaseType=17 THEN p.U_SO1_01FOLIORETAIL1 WHEN l.BaseType=23 THEN q.U_SO1_01FOLIORETAIL1 END AS folioBaseR1,
          CASE WHEN l.BaseType=17 THEN pl.U_SO1_01NUMPARTIDA WHEN l.BaseType=23 THEN ql.U_SO1_01NUMPARTIDA END AS partidaBaseR1,
          CASE WHEN l.BaseType=17 THEN p.U_SO1_01RETAILONE WHEN l.BaseType=23 THEN q.U_SO1_01RETAILONE END AS baseCreadaEnR1,
          CASE WHEN l.BaseType=17 THEN pl.ItemCode WHEN l.BaseType=23 THEN ql.ItemCode END AS itemBase,
          CASE WHEN l.BaseType=17 THEN pl.WhsCode WHEN l.BaseType=23 THEN ql.WhsCode END AS almacenBase,
          CASE WHEN l.BaseType=17 THEN pl.Quantity WHEN l.BaseType=23 THEN ql.Quantity END AS cantidadBase,
          CASE WHEN l.BaseType=17 THEN pl.InvQty WHEN l.BaseType=23 THEN ql.InvQty END AS invQtyBase
        FROM ODLN e INNER JOIN DLN1 l ON l.DocEntry = e.DocEntry
        INNER JOIN OCRD c ON c.CardCode = e.CardCode
        LEFT JOIN OSLP v ON v.SlpCode = e.SlpCode
        LEFT JOIN OUSR u ON u.USERID = e.UserSign
        LEFT JOIN OWHS w ON w.WhsCode = l.WhsCode
        LEFT JOIN ORDR p ON l.BaseType = 17 AND p.DocEntry = l.BaseEntry
        LEFT JOIN OQUT q ON l.BaseType = 23 AND q.DocEntry = l.BaseEntry
        LEFT JOIN RDR1 pl ON pl.DocEntry=p.DocEntry AND pl.LineNum=l.BaseLine
        LEFT JOIN QUT1 ql ON ql.DocEntry=q.DocEntry AND ql.LineNum=l.BaseLine
        WHERE e.DocEntry IN (${parametros})
          AND c.GroupCode IN (${GRUPOS_CLIENTE_SAP_PERMITIDOS_SQL})
          AND e.DocType = 'I'
          AND ISNULL(e.U_SO1_01RETAILONE, 'N') = 'N'
        ORDER BY e.DocEntry, l.LineNum
      `, configurar),
      consultarSap<FilaMovimientoEntregaSap>(`
        SELECT CreatedBy AS docEntry, DocLineNum AS lineNum, ItemCode AS itemCode, LocCode AS whsCode,
          SUM(OutQty - InQty) AS salida FROM OIVL
        WHERE TransType = 15 AND CreatedBy IN (${parametros})
        GROUP BY CreatedBy, DocLineNum, ItemCode, LocCode
      `, configurar),
      consultarSap<FilaFacturaEntregaSap>(`
        SELECT l.BaseEntry AS entregaDocEntry, f.DocEntry AS docEntry, f.DocNum AS docNum,
          l.BaseLine AS baseLine, l.Quantity AS cantidad
        FROM INV1 l INNER JOIN OINV f ON f.DocEntry = l.DocEntry
        WHERE l.BaseType = 15 AND l.BaseEntry IN (${parametros}) AND f.CANCELED = 'N'
      `, configurar),
    ]);
    return construirEntregasSap(documentos.recordset, movimientos.recordset, facturas.recordset);
  }
}
