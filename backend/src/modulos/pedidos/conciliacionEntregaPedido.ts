import sql from 'mssql';
import { obtenerPoolPedidosBodega } from '../../infraestructura/sql/conexionPedidosBodega.js';
import { obtenerPoolSucursalR1, obtenerSucursalesR1 } from '../../infraestructura/sql/conexionSucursalesR1.js';
import { consultarSistemaOrigen } from '../../infraestructura/sql/consultaSistemaOrigen.js';
import type { EntregaSapPersistida, LineaEntregaSap } from '../historial/entregaSap.interface.js';
import type { FiltrosPedidos, PedidoResumen } from './pedido.interface.js';
import { COLUMNAS_REFERENCIA_LINEA_R1, firmaLineaR1, type ReferenciaLineaR1 } from './firmaLineaR1.js';

export interface CandidatoEntregaR1 extends ReferenciaLineaR1 {
  codigoFuente: string; folio: string; partida: number; numeroPedido: string;
  item: string; almacen: string; cantidad: number;
  numeroCotizacion: string | null; lineaCotizacionSap: number | null;
  itemCotizacion: string | null; almacenCotizacion: string | null;
  fechaPedido?: string | null;
}
export interface ConciliacionEntrega {
  idEntrega: string; lineaEntrega: number; idPedido: string; partida: string;
  firma: string; cantidad: number; tipoRelacion: string; evidencia: object;
}
export interface CoberturaEntrega { idPedido: string; partida: string; firma: string; cantidad: number }
export interface IConciliacionEntregaPedido {
  aplicar(pedidos: PedidoResumen[]): Promise<PedidoResumen[]>;
  cantidadACompensar?(filtros: FiltrosPedidos): Promise<number>;
}

function corresponde(l: LineaEntregaSap, c: CandidatoEntregaR1): boolean {
  if (l.baseCreadaEnR1 !== 'Y' || !l.folioBaseR1 || l.partidaBaseR1 == null
    || l.baseEntry == null || l.baseLine == null || l.cantidadEntregada <= 0
    || c.item !== l.itemCode || c.almacen !== l.whsCode
    || l.itemBase !== l.itemCode || l.almacenBase !== l.whsCode) return false;
  // No convertir unidades ambiguas: esta primera conciliación admite unidades
  // de inventario 1:1 comprobadas en ambos sistemas.
  if (c.factorInventarioR1 !== 1 || l.invQty !== l.quantity
    || l.invQtyBase !== l.cantidadBase || !(Number(c.cantidad) > 0)) return false;
  if (l.baseType === 17) return c.folio === l.folioBaseR1
    && String(c.numeroPedido) === l.numeroBase && c.lineaSapR1 === l.baseLine
    && c.partida === l.partidaBaseR1;
  if (l.baseType === 23) return c.tipoBaseR1 === 'CO'
    && c.folioBaseR1 === l.folioBaseR1 && c.partidaBaseR1 === l.partidaBaseR1
    && c.lineaCotizacionSap === l.baseLine && String(c.numeroCotizacion) === l.numeroBase
    && c.itemCotizacion === l.itemCode && c.almacenCotizacion === l.whsCode;
  return false;
}

export function construirConciliaciones(entregas: EntregaSapPersistida[],
  candidatos: CandidatoEntregaR1[]): ConciliacionEntrega[] {
  return entregas.flatMap(e => e.canceled !== 'N' || e.estadoLogistico !== 'SALIDA_COMPROBADA' ? []
    : e.lineas.flatMap(l => {
      // Contar todas las referencias, incluso verificadas o con otro artículo.
      // Si una base abastece varios pedidos, no repartir ni duplicar su salida.
      const referencias = candidatos.filter(c => l.baseType === 17 ? c.folio === l.folioBaseR1
        && c.lineaSapR1 === l.baseLine : l.baseType === 23 && c.tipoBaseR1 === 'CO'
        && c.folioBaseR1 === l.folioBaseR1 && c.partidaBaseR1 === l.partidaBaseR1);
      if (referencias.length !== 1 || !corresponde(l, referencias[0]!)) return [];
      const c = referencias[0]!;
      return [{ idEntrega: e.idOrigen, lineaEntrega: l.lineNum,
        idPedido: `R1:${c.codigoFuente}:${c.folio}`, partida: String(c.partida),
        firma: firmaLineaR1(c, c.item, c.almacen, Number(c.cantidad)),
        cantidad: Math.min(l.cantidadEntregada, Math.max(0, l.salidaComprobada)),
        tipoRelacion: l.baseType === 23 ? 'R1_CO_QUT_DLN' : 'R1_PE_RDR_DLN',
        evidencia: { baseType: l.baseType, baseEntry: l.baseEntry, baseLine: l.baseLine,
          folioBaseR1: l.folioBaseR1, partidaBaseR1: l.partidaBaseR1,
          numeroBase: l.numeroBase, item: c.item, almacen: c.almacen,
          folioPedidoR1: c.folio, partidaPedidoR1: c.partida,
          lineaSapR1: c.lineaSapR1, lineaCotizacionSap: c.lineaCotizacionSap,
          cantidadOrigen: c.cantidad, factorInventarioR1: c.factorInventarioR1,
          numeroPedido: c.numeroPedido, fechaPedido: c.fechaPedido ?? null,
          salidaOivl: l.salidaComprobada } }];
    }));
}

export function aplicarCoberturas(pedidos: PedidoResumen[], coberturas: CoberturaEntrega[]): PedidoResumen[] {
  const cantidades = new Map<string, number>();
  for (const c of coberturas) {
    const clave = JSON.stringify([c.idPedido, c.partida, c.firma]);
    if (Number.isFinite(c.cantidad) && c.cantidad > 0)
      cantidades.set(clave, (cantidades.get(clave) ?? 0) + c.cantidad);
  }
  return pedidos.map(p => {
    const articulos = p.articulos.flatMap(a => {
      // SAP ya devuelve OpenQty: restar otra vez descontaría dos veces la entrega.
      if (p.origenPedido !== 'R1' || !a.firmaConciliacion || a.cantidad == null) return [{ ...a }];
      const cubierta = cantidades.get(JSON.stringify([p.idOrigen, a.identificadorDetalle, a.firmaConciliacion])) ?? 0;
      if (cubierta === 0) return [{ ...a }];
      const cantidad = Math.max(0, Math.round((a.cantidad - cubierta) * 1e6) / 1e6);
      return cantidad > 0 ? [{ ...a, cantidad }] : [];
    });
    return { ...p, articulos, codigosAlmacen: [...new Set(articulos.map(a => a.codigoAlmacen)
      .filter((v): v is string => !!v))],
      nombresBodega: [...new Set(articulos.map(a => a.nombreAlmacen).filter(Boolean))].join(', ') || null };
  }).filter(p => p.articulos.length > 0);
}

export class ConciliacionEntregaPedido implements IConciliacionEntregaPedido {
  public async cantidadACompensar(filtros: FiltrosPedidos): Promise<number> {
    const r = await obtenerPoolPedidosBodega().request()
      .input('desde', sql.Date, filtros.fechaDesde ?? null).input('hasta', sql.Date, filtros.fechaHasta ?? null)
      .input('numero', sql.NVarChar(100), filtros.numeroPedido ?? null).query<{ cantidad: number }>(`
        SELECT COUNT(DISTINCT c.idPedido) AS cantidad FROM dbo.ConciliacionEntregaPedido c
        INNER JOIN dbo.EntregaSapHistorial h ON h.idOrigen=c.idEntrega
        WHERE c.activa=1 AND h.estadoLogistico='SALIDA_COMPROBADA'
          AND (@desde IS NULL OR TRY_CONVERT(date,JSON_VALUE(c.evidencia,'$.fechaPedido'))>=@desde)
          AND (@hasta IS NULL OR TRY_CONVERT(date,JSON_VALUE(c.evidencia,'$.fechaPedido'))<=@hasta)
          AND (@numero IS NULL OR JSON_VALUE(c.evidencia,'$.numeroPedido')=@numero
            OR JSON_VALUE(c.evidencia,'$.folioPedidoR1')=@numero)
      `);
    return Number(r.recordset[0]?.cantidad ?? 0);
  }

  public async aplicar(pedidos: PedidoResumen[]): Promise<PedidoResumen[]> {
    const ids = [...new Set(pedidos.filter(p => p.origenPedido === 'R1').map(p => p.idOrigen))];
    if (!ids.length) return pedidos;
    const r = await obtenerPoolPedidosBodega().request().input('ids', sql.NVarChar(sql.MAX), JSON.stringify(ids))
      .query<CoberturaEntrega>(`
        SELECT c.idPedido,c.partida,c.firma,
          CASE WHEN c.cantidad < l.cantidadEntregada THEN c.cantidad ELSE l.cantidadEntregada END AS cantidad
        FROM OPENJSON(@ids) i INNER JOIN dbo.ConciliacionEntregaPedido c ON c.idPedido=i.value
        INNER JOIN dbo.EntregaSapHistorial h ON h.idOrigen=c.idEntrega
        INNER JOIN dbo.EntregaSapHistorialLinea l ON l.idOrigen=c.idEntrega AND l.lineNum=c.lineaEntrega
        WHERE c.activa=1 AND h.estadoLogistico='SALIDA_COMPROBADA' AND JSON_VALUE(h.datos,'$.canceled')='N'
          AND l.cantidadEntregada>0
          AND l.baseType=TRY_CONVERT(int,JSON_VALUE(c.evidencia,'$.baseType'))
          AND l.baseEntry=TRY_CONVERT(int,JSON_VALUE(c.evidencia,'$.baseEntry'))
          AND l.baseLine=TRY_CONVERT(int,JSON_VALUE(c.evidencia,'$.baseLine'))
          AND JSON_VALUE(l.datos,'$.itemCode')=JSON_VALUE(c.evidencia,'$.item')
          AND l.whsCode=JSON_VALUE(c.evidencia,'$.almacen')
          AND JSON_VALUE(l.datos,'$.folioBaseR1')=JSON_VALUE(c.evidencia,'$.folioBaseR1')
          AND EXISTS(SELECT 1 FROM OPENJSON(h.datos,'$.lineas') WITH(lineNum int) actual
            WHERE actual.lineNum=l.lineNum)
      `);
    return aplicarCoberturas(pedidos, r.recordset);
  }

  public async sincronizar(entregas: EntregaSapPersistida[]): Promise<void> {
    if (!entregas.length) return;
    const folios = [...new Set(entregas.flatMap(e => e.lineas.flatMap(l =>
      l.baseCreadaEnR1 === 'Y' && l.folioBaseR1 && [17,23].includes(l.baseType) ? [l.folioBaseR1] : [])))];
    // Cada consulta está acotada a las bases del lote; jamás recorre el histórico.
    await Promise.all(obtenerSucursalesR1().map(async sucursal => {
      const propios = folios.filter(f => f.startsWith(sucursal.codigoTienda.slice(1,4)));
      if (!propios.length) return;
      try {
        const pool = await obtenerPoolSucursalR1(sucursal);
        const candidatos: CandidatoEntregaR1[] = [];
        for (let i=0;i<propios.length;i+=100) {
          const loteFolios = propios.slice(i,i+100);
          const parametrosFolios = loteFolios.map((_,j) => `@folio${j}`).join(',');
          const r = await consultarSistemaOrigen<Omit<CandidatoEntregaR1,'codigoFuente'>>(`
            SELECT TOP (2001) venta.Name AS folio,detalle.U_SO1_NUMPARTIDA AS partida,
              CONVERT(char(10),venta.U_SO1_FECHA,126) AS fechaPedido,
              CONVERT(varchar(20),venta.U_SO1_DOCUMENTOSBO) AS numeroPedido,
              detalle.U_SO1_NUMEROARTICULO AS item,detalle.U_SO1_ALMACEN AS almacen,
              detalle.U_SO1_CANTIDAD AS cantidad,${COLUMNAS_REFERENCIA_LINEA_R1},
              CONVERT(varchar(20),cotizacion.U_SO1_DOCUMENTOSBO) AS numeroCotizacion,
              base.U_SO1_PARTIDASBO AS lineaCotizacionSap,
              base.U_SO1_NUMEROARTICULO AS itemCotizacion,base.U_SO1_ALMACEN AS almacenCotizacion
            FROM [@SO1_01VENTA] venta INNER JOIN [@SO1_01VENTADETALLE] detalle ON detalle.U_SO1_FOLIO=venta.Name
            LEFT JOIN [@SO1_01VENTADETALLE] base ON detalle.U_SO1_TIPODOCBASE='CO'
              AND base.U_SO1_FOLIO=detalle.U_SO1_DOCUMENTOBASE AND base.U_SO1_NUMPARTIDA=detalle.U_SO1_PARTIDABASE
            LEFT JOIN [@SO1_01VENTA] cotizacion ON cotizacion.Name=base.U_SO1_FOLIO AND cotizacion.U_SO1_TIPO='CO'
            WHERE venta.U_SO1_TIPO='PE'
              AND (venta.Name IN (${parametrosFolios})
                OR (detalle.U_SO1_TIPODOCBASE='CO' AND detalle.U_SO1_DOCUMENTOBASE IN (${parametrosFolios})))
          `, r => { loteFolios.forEach((f,j) => r.input(`folio${j}`,sql.NVarChar(100),f)); return r; }, () => pool);
          if (r.recordset.length > 2000) throw new Error('Lote R1 de conciliación incompleto.');
          candidatos.push(...r.recordset.map(c => ({ ...c, codigoFuente: sucursal.codigoTienda })));
        }
        const lote = entregas.filter(e => e.lineas.some(l => l.folioBaseR1 && propios.includes(l.folioBaseR1)));
        const relaciones = construirConciliaciones(lote, candidatos);
        await this.guardar(lote.map(e => e.idOrigen), sucursal.codigoTienda, relaciones);
      } catch {
        // No interpretar una fuente caída como cero relaciones ni reemplazar evidencia.
        console.warn('No fue posible revisar la conciliación R1; se conserva la evidencia local.');
      }
    }));
  }

  public async guardar(ids: string[], codigoFuente: string, relaciones: ConciliacionEntrega[]): Promise<void> {
    await obtenerPoolPedidosBodega().request().input('ids', sql.NVarChar(sql.MAX), JSON.stringify(ids))
      .input('fuente', sql.VarChar(30), `R1:${codigoFuente}:%`)
      .input('datos', sql.NVarChar(sql.MAX), JSON.stringify(relaciones)).query(`
      IF DB_NAME() <> N'PedidosBodega' THROW 51000, 'Base no autorizada.', 1;
      SET XACT_ABORT ON;
      BEGIN TRANSACTION;
      BEGIN TRY
        DECLARE @n TABLE(idEntrega varchar(100),lineaEntrega int,idPedido varchar(100),partida varchar(20),
          firma varchar(64),cantidad decimal(19,6),tipoRelacion varchar(40),evidencia nvarchar(max));
        INSERT @n SELECT idEntrega,lineaEntrega,idPedido,partida,firma,cantidad,tipoRelacion,evidencia
          FROM OPENJSON(@datos) WITH(idEntrega varchar(100),lineaEntrega int,idPedido varchar(100),partida varchar(20),
            firma varchar(64),cantidad decimal(19,6),tipoRelacion varchar(40),evidencia nvarchar(max) AS JSON);
        UPDATE c WITH(UPDLOCK,HOLDLOCK) SET firma=n.firma,cantidad=n.cantidad,tipoRelacion=n.tipoRelacion,
          evidencia=n.evidencia,activa=1,revisadoEn=SYSUTCDATETIME() FROM dbo.ConciliacionEntregaPedido c
          INNER JOIN @n n ON n.idEntrega=c.idEntrega AND n.lineaEntrega=c.lineaEntrega AND n.idPedido=c.idPedido AND n.partida=c.partida;
        INSERT dbo.ConciliacionEntregaPedido(idEntrega,lineaEntrega,idPedido,partida,firma,cantidad,tipoRelacion,evidencia)
          SELECT n.* FROM @n n WHERE NOT EXISTS(SELECT 1 FROM dbo.ConciliacionEntregaPedido c WITH(UPDLOCK,HOLDLOCK)
            WHERE n.idEntrega=c.idEntrega AND n.lineaEntrega=c.lineaEntrega AND n.idPedido=c.idPedido AND n.partida=c.partida);
        UPDATE c SET activa=0,revisadoEn=SYSUTCDATETIME() FROM dbo.ConciliacionEntregaPedido c WHERE c.idPedido LIKE @fuente
          AND c.idEntrega IN (SELECT value FROM OPENJSON(@ids)) AND NOT EXISTS(SELECT 1 FROM @n n
            WHERE n.idEntrega=c.idEntrega AND n.lineaEntrega=c.lineaEntrega AND n.idPedido=c.idPedido AND n.partida=c.partida);
        COMMIT;
      END TRY BEGIN CATCH IF @@TRANCOUNT>0 ROLLBACK; THROW; END CATCH
    `);
  }
}
