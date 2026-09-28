import sql from 'mssql';
import { createHash } from 'node:crypto';
import { consultarSap } from '../../infraestructura/sql/consultaSap.js';
import { obtenerPoolPedidosBodega } from '../../infraestructura/sql/conexionPedidosBodega.js';
import { ErrorAplicacion } from '../../compartido/errores/errorAplicacion.js';
import type { PedidoDevuelto } from './pedidoDevueltoServicio.js';
import type { FiltrosDevolucion } from './pedidoDevueltoRepositorio.js';

export const MIGRACION_CANCELACIONES_SAP = `
IF DB_NAME() <> N'PedidosBodega' THROW 51000, 'Base no autorizada.', 1;
IF OBJECT_ID(N'dbo.CancelacionSapHistorial',N'U') IS NULL
BEGIN
  CREATE TABLE dbo.CancelacionSapHistorial (
    idClave varchar(64) NOT NULL PRIMARY KEY,
    docEntry int NOT NULL UNIQUE,
    numeroPedido nvarchar(100) NOT NULL,
    folioPedido nvarchar(100) NULL,
    fechaPedido date NOT NULL,
    canceled char(1) NOT NULL CHECK(canceled='Y'),
    snapshot nvarchar(max) NOT NULL CHECK(ISJSON(snapshot)=1),
    detectadoEn datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME()
  );
  CREATE INDEX IX_CancelacionSapHistorial_fecha ON dbo.CancelacionSapHistorial(fechaPedido DESC,docEntry);
END;`;

export interface FilaCanceladaSap {
  docEntry: number; numeroPedido: string; folioPedido: string | null;
  fechaPedido: Date; horaPedido: number | null; canceled: string; docStatus: string;
  nombreVendedor: string | null; linea: number | null; codigoArticulo: string | null;
  descripcion: string | null; cantidad: number | null; codigoAlmacen: string | null;
}

export const CONSULTA_CANCELACIONES_SAP = `SELECT o.DocEntry docEntry,CONVERT(nvarchar(100),o.DocNum) numeroPedido,
  o.U_SO1_01FOLIORETAIL1 folioPedido,o.DocDate fechaPedido,o.DocTime horaPedido,
  o.CANCELED canceled,o.DocStatus docStatus,v.SlpName nombreVendedor,
  d.LineNum linea,d.ItemCode codigoArticulo,d.Dscription descripcion,d.Quantity cantidad,d.WhsCode codigoAlmacen
  FROM dbo.ORDR o LEFT JOIN dbo.RDR1 d ON d.DocEntry=o.DocEntry
  LEFT JOIN dbo.OSLP v ON v.SlpCode=o.SlpCode
  WHERE o.CANCELED='Y'
  ORDER BY o.DocEntry,d.LineNum`;

export function convertirCancelaciones(filas: FilaCanceladaSap[]): PedidoDevuelto[] {
  const pedidos = new Map<number, PedidoDevuelto>();
  for (const f of filas) {
    if (f.canceled !== 'Y') continue;
    let p = pedidos.get(f.docEntry);
    if (!p) {
      const fecha = new Date(f.fechaPedido);
      const hora = Number(f.horaPedido ?? 0);
      // SAP almacena fecha/hora local de Honduras. No es la fecha del evento de cancelación.
      fecha.setUTCHours(Math.floor(hora / 100) + 6, hora % 100, 0, 0);
      p = {
        idClave: createHash('sha256').update(`SAP:ORDR:${f.docEntry}:CANCELED:Y`).digest('hex'),
        idOrigen: `SAP:${f.docEntry}`, origenPedido: 'SAP', numeroPedido: String(f.numeroPedido),
        folioPedido: f.folioPedido?.trim() || null, nombreVendedor: f.nombreVendedor?.trim() || null,
        fechaHoraPedido: fecha.toISOString(), fechaCancelacion: null, fechaDespacho: null,
        fueDespachado: false, estado: 'CANCEL', motivo: 'Pedido cancelado en SAP',
        progreso: 0, totalLineas: 0, lineas: [],
      };
      pedidos.set(f.docEntry, p);
    }
    if (f.linea !== null && !p.lineas.some(l => l.identificadorDetalle === String(f.linea))) {
      p.lineas.push({ identificadorDetalle: String(f.linea), codigoArticulo: f.codigoArticulo?.trim() || null,
        descripcion: f.descripcion?.trim() || null, cantidad: Number(f.cantidad ?? 0),
        codigoAlmacen: f.codigoAlmacen?.trim() || null, estado: 'CANCEL' });
      p.totalLineas = p.lineas.length;
    }
  }
  return [...pedidos.values()];
}

export class CancelacionSapHistorial {
  private preparada = false;
  private enCurso?: Promise<void>;
  private siguienteRevision = 0;
  private ultimoError: unknown;

  constructor(private readonly fuente = consultarSap) {}

  public async preparar(): Promise<void> {
    if (this.preparada) return;
    await obtenerPoolPedidosBodega().request().query(MIGRACION_CANCELACIONES_SAP);
    this.preparada = true;
  }

  public async sincronizar(): Promise<void> {
    if (this.enCurso) return this.enCurso;
    if (Date.now() < this.siguienteRevision) {
      if (this.ultimoError) throw this.ultimoError;
      return;
    }
    this.enCurso = this.importar();
    try { await this.enCurso; this.ultimoError = undefined; }
    catch (error) { this.ultimoError = error; throw error; }
    finally { this.enCurso = undefined; this.siguienteRevision = Date.now() + 60_000; }
  }

  private async importar(): Promise<void> {
    await this.preparar();
    const filas = (await this.fuente<FilaCanceladaSap>(CONSULTA_CANCELACIONES_SAP)).recordset;
    const pedidos = convertirCancelaciones(filas);
    if (!pedidos.length) return;
    const datos = pedidos.map(p => ({ idClave: p.idClave, docEntry: Number(p.idOrigen.slice(4)),
      numeroPedido: p.numeroPedido, folioPedido: p.folioPedido,
      fechaPedido: filas.find(f => `SAP:${f.docEntry}` === p.idOrigen)!.fechaPedido.toISOString().slice(0, 10),
      snapshot: JSON.stringify(p) }));
    await obtenerPoolPedidosBodega().request().input('datos', sql.NVarChar(sql.MAX), JSON.stringify(datos)).query(`
      IF DB_NAME() <> N'PedidosBodega' THROW 51000, 'Base no autorizada.', 1;
      SET XACT_ABORT ON; BEGIN TRANSACTION;
      INSERT dbo.CancelacionSapHistorial(idClave,docEntry,numeroPedido,folioPedido,fechaPedido,canceled,snapshot)
      SELECT j.idClave,j.docEntry,j.numeroPedido,j.folioPedido,j.fechaPedido,'Y',j.snapshot
      FROM OPENJSON(@datos) WITH(idClave varchar(64),docEntry int,numeroPedido nvarchar(100),
        folioPedido nvarchar(100),fechaPedido date,snapshot nvarchar(max)) j
      WHERE NOT EXISTS(SELECT 1 FROM dbo.CancelacionSapHistorial h WITH(UPDLOCK,HOLDLOCK) WHERE h.docEntry=j.docEntry);
      COMMIT TRANSACTION;`);
  }

  private async actualizar(): Promise<void> {
    await this.preparar();
    try { await this.sincronizar(); }
    catch (error) {
      const r = await obtenerPoolPedidosBodega().request().query('SELECT COUNT(*) cantidad FROM dbo.CancelacionSapHistorial');
      if (!r.recordset[0]?.cantidad) throw error;
      console.error('SAP no disponible: se conserva el historial de cancelaciones confirmado.');
    }
  }

  public async listar(f: FiltrosDevolucion): Promise<{ datos: PedidoDevuelto[]; total: number }> {
    await this.actualizar();
    const r = await obtenerPoolPedidosBodega().request()
      .input('numero', sql.NVarChar(100), f.numeroPedido || null)
      .input('desde', sql.VarChar(10), f.fechaDesde || null).input('hasta', sql.VarChar(10), f.fechaHasta || null)
      .query<{ snapshot: string }>(`SELECT snapshot FROM dbo.CancelacionSapHistorial
        WHERE canceled='Y' AND (@numero IS NULL OR numeroPedido=@numero OR folioPedido=@numero)
        AND (@desde IS NULL OR fechaPedido>=CONVERT(date,@desde))
        AND (@hasta IS NULL OR fechaPedido<=CONVERT(date,@hasta)) ORDER BY fechaPedido DESC,docEntry DESC`);
    let pedidos = r.recordset.map(fila => JSON.parse(fila.snapshot) as PedidoDevuelto)
      .filter(p => p.estado === 'CANCEL');
    if (f.codigosAlmacen.length) {
      const permitidos = new Set(f.codigosAlmacen.map(c => c.toUpperCase()));
      pedidos = pedidos.map(p => ({ ...p, lineas: p.lineas.filter(l => permitidos.has(l.codigoAlmacen?.toUpperCase() ?? '')) }))
        .filter(p => p.lineas.length > 0);
    }
    // Todos los registros de esta pantalla son CANCEL; no dependen del estado de recepción física.
    const inicio = (f.pagina - 1) * f.cantidadPorPagina;
    if (f.vista === 'pedido') return { datos: pedidos.slice(inicio, inicio + f.cantidadPorPagina), total: pedidos.length };
    const lineas = pedidos.flatMap(p => p.lineas.map(l => ({ p, l })));
    const pagina = new Map<string, PedidoDevuelto>();
    for (const { p, l } of lineas.slice(inicio, inicio + f.cantidadPorPagina)) {
      if (!pagina.has(p.idClave)) pagina.set(p.idClave, { ...p, lineas: [] });
      pagina.get(p.idClave)!.lineas.push(l);
    }
    return { datos: [...pagina.values()], total: lineas.length };
  }

  public async obtener(id: string): Promise<PedidoDevuelto | null> {
    await this.actualizar();
    const r = await obtenerPoolPedidosBodega().request().input('id', sql.VarChar(64), id)
      .query<{ snapshot: string }>("SELECT snapshot FROM dbo.CancelacionSapHistorial WHERE idClave=@id AND canceled='Y'");
    return r.recordset[0] ? JSON.parse(r.recordset[0].snapshot) as PedidoDevuelto : null;
  }

  public async confirmar(): Promise<void> {
    throw new ErrorAplicacion(409, 'HISTORIAL_CANCELACIONES', 'Este historial conserva cancelaciones SAP; no registra recepciones físicas.');
  }
}

export const cancelacionesSap = new CancelacionSapHistorial();
