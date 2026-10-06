import sql from 'mssql';
import { createHash } from 'node:crypto';
import { consultarSap } from '../../infraestructura/sql/consultaSap.js';
import { obtenerPoolPedidosBodega } from '../../infraestructura/sql/conexionPedidosBodega.js';
import { ErrorAplicacion } from '../../compartido/errores/errorAplicacion.js';
import type { PedidoDevuelto } from './pedidoDevueltoServicio.js';
import type { FiltrosDevolucion } from './pedidoDevueltoRepositorio.js';
import { esLineaFlete } from '../pedidos/lineaFlete.js';
import { obtenerPoolSucursalR1, obtenerSucursalesR1 } from '../../infraestructura/sql/conexionSucursalesR1.js';
import { validarConsultaSistemaOrigen } from '../../infraestructura/sql/consultaSistemaOrigen.js';
import { CONDICION_HISTORIAL_R1 } from '../historial/historialR1Repositorio.js';
import { columnasEvidenciaCierreSap } from '../historial/cierreSap.js';

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
    detectadoEn datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
    activo bit NOT NULL DEFAULT 1
  );
  CREATE INDEX IX_CancelacionSapHistorial_fecha ON dbo.CancelacionSapHistorial(fechaPedido DESC,docEntry);
END;
IF COL_LENGTH(N'dbo.CancelacionSapHistorial',N'activo') IS NULL
  ALTER TABLE dbo.CancelacionSapHistorial ADD activo bit NOT NULL
    CONSTRAINT DF_CancelacionSapHistorial_activo DEFAULT 1;
IF OBJECT_ID(N'dbo.CierreSapDevueltos',N'U') IS NULL
BEGIN
  CREATE TABLE dbo.CierreSapDevueltos (
    idClave varchar(64) NOT NULL PRIMARY KEY,
    docEntry int NOT NULL UNIQUE,
    numeroPedido nvarchar(100) NOT NULL,
    folioPedido nvarchar(100) NULL,
    fechaPedido date NOT NULL,
    snapshot nvarchar(max) NOT NULL CHECK(ISJSON(snapshot)=1),
    activo bit NOT NULL DEFAULT 1
  );
END;
IF OBJECT_ID(N'dbo.RecepcionDevolucionPedido',N'U') IS NULL
BEGIN
  CREATE TABLE dbo.RecepcionDevolucionPedido (
    idPedidoDespachado bigint NOT NULL PRIMARY KEY
      REFERENCES dbo.PedidoDespachado(idPedidoDespachado),
    idOrigen nvarchar(150) NOT NULL UNIQUE,
    estadoOrigen varchar(10) NOT NULL CHECK(estadoOrigen IN('CERRADO','CANCELADO')),
    usuarioRecibio nvarchar(100) NOT NULL,
    nombreRecibio nvarchar(200) NOT NULL,
    registradoPorUsuarioId uniqueidentifier NOT NULL
      REFERENCES dbo.UsuarioAplicacion(idUsuario),
    recibidoEn datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME()
  );
  CREATE INDEX IX_RecepcionDevolucionPedido_fecha
    ON dbo.RecepcionDevolucionPedido(recibidoEn DESC,idOrigen);
END;`;

export interface FilaCanceladaSap {
  docEntry: number; numeroPedido: string; folioPedido: string | null;
  fechaPedido: Date; horaPedido: number | null; canceled: string; docStatus: string;
  nombreVendedor: string | null; linea: number | null; codigoArticulo: string | null;
  descripcion: string | null; cantidad: number | null; codigoAlmacen: string | null;
  tieneEntrega?: number; tieneFacturaDirecta?: number;
  tieneFacturaViaEntrega?: number;
}

interface FilaHistorialDevolucion {
  snapshot: string;
  nombreRecibio: string | null;
  recibidoEn: Date | null;
}

function pedidoConRecepcion(fila: FilaHistorialDevolucion): PedidoDevuelto {
  const pedido = JSON.parse(fila.snapshot) as PedidoDevuelto;
  if (!fila.nombreRecibio || !fila.recibidoEn) return pedido;
  const recibidoEn = fila.recibidoEn.toISOString();
  return { ...pedido, fueDespachado: true, estado: 'DEVUELTO', progreso: 100,
    lineasRecibidas: pedido.lineas.length, fechaDevolucionCompleta: recibidoEn,
    recibidoPor: fila.nombreRecibio, recibidoEn,
    lineas: pedido.lineas.map(linea => ({ ...linea, estado: 'DEVUELTO',
      cantidadRecibida: linea.cantidad, recibidoPor: fila.nombreRecibio, recibidoEn })) };
}

export const CONSULTA_CANCELACIONES_SAP = `SELECT o.DocEntry docEntry,CONVERT(nvarchar(100),o.DocNum) numeroPedido,
  o.U_SO1_01FOLIORETAIL1 folioPedido,o.DocDate fechaPedido,o.DocTime horaPedido,
  o.CANCELED canceled,o.DocStatus docStatus,v.SlpName nombreVendedor,
  ${columnasEvidenciaCierreSap('o')},
  d.LineNum linea,d.ItemCode codigoArticulo,d.Dscription descripcion,d.Quantity cantidad,d.WhsCode codigoAlmacen
  FROM dbo.ORDR o LEFT JOIN dbo.RDR1 d ON d.DocEntry=o.DocEntry
  LEFT JOIN dbo.OSLP v ON v.SlpCode=o.SlpCode
  WHERE o.CANCELED='Y'
  ORDER BY o.DocEntry,d.LineNum`;

export const CONSULTA_CIERRES_DEVUELTOS_SAP = CONSULTA_CANCELACIONES_SAP
  .replace("WHERE o.CANCELED='Y'", `WHERE o.CANCELED='N' AND o.DocStatus='C'
    AND NOT EXISTS (SELECT 1 FROM dbo.INV1 l JOIN dbo.OINV h ON h.DocEntry=l.DocEntry
      WHERE l.BaseType=17 AND l.BaseEntry=o.DocEntry AND h.CANCELED='N')
    AND NOT EXISTS (SELECT 1 FROM dbo.DLN1 d0 JOIN dbo.ODLN e ON e.DocEntry=d0.DocEntry
      JOIN dbo.INV1 l ON l.BaseType=15 AND l.BaseEntry=e.DocEntry
      JOIN dbo.OINV h ON h.DocEntry=l.DocEntry
      WHERE d0.BaseType=17 AND d0.BaseEntry=o.DocEntry
        AND e.CANCELED='N' AND h.CANCELED='N')`);

export function convertirCancelaciones(
  filas: FilaCanceladaSap[],
  pedidosFacturados = new Set<string>(),
): PedidoDevuelto[] {
  const pedidos = new Map<number, PedidoDevuelto>();
  const documentosConLineas = new Set<number>();
  for (const f of filas) {
    if (pedidosFacturados.has(String(f.numeroPedido).trim())
      || f.tieneFacturaDirecta === 1 || f.tieneFacturaViaEntrega === 1) continue;
    const cerrado = f.canceled === 'N' && f.docStatus === 'C'
      && f.tieneFacturaDirecta !== 1 && f.tieneFacturaViaEntrega !== 1;
    if (f.canceled !== 'Y' && !cerrado) continue;
    const estado = cerrado ? 'CERRADO' : 'CANCEL';
    if (f.linea !== null) documentosConLineas.add(f.docEntry);
    let p = pedidos.get(f.docEntry);
    if (!p) {
      const fecha = new Date(f.fechaPedido);
      const hora = Number(f.horaPedido ?? 0);
      // SAP almacena fecha/hora local de Honduras. No es la fecha del evento de cancelación.
      fecha.setUTCHours(Math.floor(hora / 100) + 6, hora % 100, 0, 0);
      p = {
        idClave: createHash('sha256').update(`SAP:ORDR:${f.docEntry}:${cerrado ? 'CERRADO:SIN_ENTREGA_NI_FACTURA' : 'CANCELED:Y'}`).digest('hex'),
        idOrigen: `SAP:${f.docEntry}`, origenPedido: 'SAP', numeroPedido: String(f.numeroPedido),
        folioPedido: f.folioPedido?.trim() || null, nombreVendedor: f.nombreVendedor?.trim() || null,
        fechaHoraPedido: fecha.toISOString(), fechaCancelacion: null, fechaDespacho: null,
        fueDespachado: false, estado, motivo: cerrado ? 'Pedido cerrado sin entrega ni factura en SAP' : 'Pedido cancelado en SAP',
        progreso: 0, totalLineas: 0, lineas: [],
      };
      pedidos.set(f.docEntry, p);
    }
    if (f.linea !== null && !esLineaFlete(f.codigoArticulo, f.descripcion)
      && !p.lineas.some(l => l.identificadorDetalle === String(f.linea))) {
      p.lineas.push({ identificadorDetalle: String(f.linea), codigoArticulo: f.codigoArticulo?.trim() || null,
        descripcion: f.descripcion?.trim() || null, cantidad: Number(f.cantidad ?? 0),
        codigoAlmacen: f.codigoAlmacen?.trim() || null, estado });
      p.totalLineas = p.lineas.length;
    }
  }
  return [...pedidos.entries()].flatMap(([docEntry, pedido]) =>
    documentosConLineas.has(docEntry) && pedido.lineas.length === 0 ? [] : [pedido]);
}

export async function obtenerPedidosFacturadosR1(numerosPedido: string[]): Promise<Set<string>> {
  const numeros = [...new Set(numerosPedido.map((numero) => numero.trim()).filter(Boolean))];
  if (!numeros.length) return new Set();
  const resultados = await Promise.all(obtenerSucursalesR1().map(async (sucursal) => {
    const pool = await obtenerPoolSucursalR1(sucursal);
    const facturados: { numeroPedido: string }[] = [];
    for (let inicio = 0; inicio < numeros.length; inicio += 500) {
      const lote = numeros.slice(inicio, inicio + 500);
      const parametros = lote.map((_, indice) => `@numeroPedido${indice}`);
      const consulta = `SELECT DISTINCT CONVERT(nvarchar(100), venta.[U_SO1_DOCUMENTOSBO]) numeroPedido
        FROM dbo.[@SO1_01VENTA] venta
        WHERE ${CONDICION_HISTORIAL_R1}
          AND CONVERT(nvarchar(100), venta.[U_SO1_DOCUMENTOSBO]) IN (${parametros.join(', ')});`;
      validarConsultaSistemaOrigen(consulta);
      const solicitud = pool.request();
      lote.forEach((numero, indice) =>
        solicitud.input(`numeroPedido${indice}`, sql.NVarChar(100), numero));
      facturados.push(...(await solicitud.query<{ numeroPedido: string }>(consulta)).recordset);
    }
    return facturados;
  }));
  return new Set(resultados.flat().map(({ numeroPedido }) => numeroPedido.trim()));
}

export class CancelacionSapHistorial {
  private preparada = false;
  private enCurso?: Promise<void>;
  private siguienteRevision = 0;
  private ultimoError: unknown;

  constructor(
    private readonly fuente = consultarSap,
    private readonly consultarFacturadosR1 = obtenerPedidosFacturadosR1,
  ) {}

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
    const canceladas = (await this.fuente<FilaCanceladaSap>(CONSULTA_CANCELACIONES_SAP)).recordset;
    const cerradas = (await this.fuente<FilaCanceladaSap>(CONSULTA_CIERRES_DEVUELTOS_SAP)).recordset;
    const filas = [...canceladas, ...cerradas];
    const facturadosR1 = await this.consultarFacturadosR1(cerradas
      .filter((fila) => fila.canceled === 'N' && fila.docStatus === 'C')
      .map((fila) => String(fila.numeroPedido)));
    const pedidos = convertirCancelaciones(filas, facturadosR1);
    const fechas = new Map(filas.map(f => [f.docEntry, f.fechaPedido.toISOString().slice(0, 10)]));
    const datos = pedidos.map(p => ({ idClave: p.idClave, docEntry: Number(p.idOrigen.slice(4)),
      numeroPedido: p.numeroPedido, folioPedido: p.folioPedido,
      fechaPedido: fechas.get(Number(p.idOrigen.slice(4)))!,
      estado: p.estado, snapshot: JSON.stringify(p) }));
    const transaccion = obtenerPoolPedidosBodega().transaction();
    await transaccion.begin();
    try {
      await transaccion.request().batch(`
      IF DB_NAME() <> N'PedidosBodega' THROW 51000, 'Base no autorizada.', 1;
      CREATE TABLE #SnapshotsDevueltos(idClave varchar(64),docEntry int PRIMARY KEY,numeroPedido nvarchar(100),
        folioPedido nvarchar(100),fechaPedido date,estado nvarchar(20),snapshot nvarchar(max));`);
      for (let inicio = 0; inicio < datos.length; inicio += 250) {
        await transaccion.request().input('datos', sql.NVarChar(sql.MAX), JSON.stringify(datos.slice(inicio, inicio + 250))).query(`
        INSERT #SnapshotsDevueltos SELECT * FROM OPENJSON(@datos)
        WITH(idClave varchar(64),docEntry int,numeroPedido nvarchar(100),
          folioPedido nvarchar(100),fechaPedido date,estado nvarchar(20),snapshot nvarchar(max));`);
      }
      await transaccion.request().query(`
      INSERT dbo.CancelacionSapHistorial(idClave,docEntry,numeroPedido,folioPedido,fechaPedido,canceled,snapshot)
      SELECT j.idClave,j.docEntry,j.numeroPedido,j.folioPedido,j.fechaPedido,'Y',j.snapshot
      FROM #SnapshotsDevueltos j
      WHERE j.estado='CANCEL' AND NOT EXISTS(SELECT 1 FROM dbo.CancelacionSapHistorial h WITH(UPDLOCK,HOLDLOCK) WHERE h.docEntry=j.docEntry);
      UPDATE h WITH(UPDLOCK,HOLDLOCK) SET activo=CASE WHEN EXISTS(
        SELECT 1 FROM #SnapshotsDevueltos j WHERE j.docEntry=h.docEntry AND j.estado='CANCEL'
      ) THEN 1 ELSE 0 END
      FROM dbo.CancelacionSapHistorial h;
      -- Los cierres dejan de mostrarse si se reabren, se cancelan o adquieren entrega/factura.
      UPDATE h WITH(UPDLOCK,HOLDLOCK) SET activo=0 FROM dbo.CierreSapDevueltos h
      WHERE h.activo=1 AND NOT EXISTS(SELECT 1 FROM #SnapshotsDevueltos j
        WHERE j.docEntry=h.docEntry AND j.estado='CERRADO');
      UPDATE h SET snapshot=j.snapshot,activo=1,numeroPedido=j.numeroPedido,
        folioPedido=j.folioPedido,fechaPedido=j.fechaPedido
      FROM dbo.CierreSapDevueltos h JOIN #SnapshotsDevueltos j ON j.docEntry=h.docEntry
      WHERE j.estado='CERRADO' AND (h.activo=0 OR h.snapshot<>j.snapshot);
      INSERT dbo.CierreSapDevueltos(idClave,docEntry,numeroPedido,folioPedido,fechaPedido,snapshot)
      SELECT j.idClave,j.docEntry,j.numeroPedido,j.folioPedido,j.fechaPedido,j.snapshot
      FROM #SnapshotsDevueltos j
      WHERE j.estado='CERRADO' AND NOT EXISTS(SELECT 1 FROM dbo.CierreSapDevueltos h WITH(UPDLOCK,HOLDLOCK) WHERE h.docEntry=j.docEntry);
      -- Un cierre/anulación sin salida comprobada permanece en Entregados hasta registrar
      -- quién recibió físicamente la devolución. No altera la asignación de preparación.
      UPDATE p SET estadoLocal='CERRADO',
        cerradoDetectadoEn=COALESCE(p.cerradoDetectadoEn,SYSUTCDATETIME()),
        actualizadoEn=SYSUTCDATETIME()
      FROM dbo.PedidoDespachado p
      WHERE p.estadoLocal='DESPACHADO' AND (
        EXISTS(SELECT 1 FROM dbo.CancelacionSapHistorial h WHERE h.canceled='Y' AND
          ((p.origenPedido='SAP' AND TRY_CONVERT(int,p.sapDocEntry)=h.docEntry)
            OR (p.origenPedido='R1' AND (p.numeroPedido=h.numeroPedido OR p.folioPedido=h.folioPedido))))
        OR EXISTS(SELECT 1 FROM dbo.CierreSapDevueltos h WHERE h.activo=1 AND
          ((p.origenPedido='SAP' AND TRY_CONVERT(int,p.sapDocEntry)=h.docEntry)
            OR (p.origenPedido='R1' AND (p.numeroPedido=h.numeroPedido OR p.folioPedido=h.folioPedido))))
      );
      DROP TABLE #SnapshotsDevueltos;`);
      await transaccion.commit();
    } catch (error) {
      await transaccion.rollback();
      throw error;
    }
  }

  private async actualizar(): Promise<void> {
    await this.preparar();
    try { await this.sincronizar(); }
    catch (error) {
      const r = await obtenerPoolPedidosBodega().request().query('SELECT (SELECT COUNT(*) FROM dbo.CancelacionSapHistorial WHERE activo=1) + (SELECT COUNT(*) FROM dbo.CierreSapDevueltos WHERE activo=1) cantidad');
      if (!r.recordset[0]?.cantidad) throw error;
      console.error('SAP no disponible: se conserva el historial de cancelaciones confirmado.');
    }
  }

  public async listar(f: FiltrosDevolucion): Promise<{ datos: PedidoDevuelto[]; total: number }> {
    await this.actualizar();
    const r = await obtenerPoolPedidosBodega().request()
      .input('numero', sql.NVarChar(100), f.numeroPedido || null)
      .input('desde', sql.VarChar(10), f.fechaDesde || null).input('hasta', sql.VarChar(10), f.fechaHasta || null)
      .query<FilaHistorialDevolucion>(`WITH Historial AS (
        SELECT snapshot,numeroPedido,folioPedido,fechaPedido,docEntry FROM dbo.CancelacionSapHistorial WHERE canceled='Y' AND activo=1
        UNION ALL
        SELECT snapshot,numeroPedido,folioPedido,fechaPedido,docEntry FROM dbo.CierreSapDevueltos WHERE activo=1
      ) SELECT h.snapshot,recepcion.nombreRecibio,recepcion.recibidoEn
      FROM Historial h OUTER APPLY(SELECT TOP(1) p.idPedidoDespachado
        FROM dbo.PedidoDespachado p WHERE p.estadoLocal='CERRADO' AND (
          (p.origenPedido='SAP' AND TRY_CONVERT(int,p.sapDocEntry)=h.docEntry)
          OR (p.origenPedido='R1' AND (p.numeroPedido=h.numeroPedido OR p.folioPedido=h.folioPedido)))
        ORDER BY p.idPedidoDespachado DESC) despachado
      LEFT JOIN dbo.RecepcionDevolucionPedido recepcion
        ON recepcion.idPedidoDespachado=despachado.idPedidoDespachado
      WHERE (@numero IS NULL OR h.numeroPedido=@numero OR h.folioPedido=@numero)
        AND (@desde IS NULL OR h.fechaPedido>=CONVERT(date,@desde))
        AND (@hasta IS NULL OR h.fechaPedido<=CONVERT(date,@hasta))
        AND (despachado.idPedidoDespachado IS NULL OR recepcion.idPedidoDespachado IS NOT NULL)
      ORDER BY h.fechaPedido DESC,h.docEntry DESC`);
    let pedidos = r.recordset.filter(fila => {
      const estado = (JSON.parse(fila.snapshot) as PedidoDevuelto).estado;
      return estado === 'CANCEL' || estado === 'CERRADO';
    }).map(pedidoConRecepcion);
    if (f.codigosAlmacen.length) {
      const permitidos = new Set(f.codigosAlmacen.map(c => c.toUpperCase()));
      pedidos = pedidos.map(p => ({ ...p, lineas: p.lineas.filter(l => permitidos.has(l.codigoAlmacen?.toUpperCase() ?? '')) }))
        .filter(p => p.lineas.length > 0);
    }
    // El estado SAP no confirma recepción física de mercadería.
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
      .query<FilaHistorialDevolucion>(`WITH Historial AS (
        SELECT snapshot,numeroPedido,folioPedido,docEntry FROM dbo.CancelacionSapHistorial
          WHERE idClave=@id AND canceled='Y' AND activo=1
        UNION ALL SELECT snapshot,numeroPedido,folioPedido,docEntry FROM dbo.CierreSapDevueltos
          WHERE idClave=@id AND activo=1
      ) SELECT h.snapshot,recepcion.nombreRecibio,recepcion.recibidoEn
      FROM Historial h OUTER APPLY(SELECT TOP(1) p.idPedidoDespachado
        FROM dbo.PedidoDespachado p WHERE p.estadoLocal='CERRADO' AND (
          (p.origenPedido='SAP' AND TRY_CONVERT(int,p.sapDocEntry)=h.docEntry)
          OR (p.origenPedido='R1' AND (p.numeroPedido=h.numeroPedido OR p.folioPedido=h.folioPedido)))
        ORDER BY p.idPedidoDespachado DESC) despachado
      LEFT JOIN dbo.RecepcionDevolucionPedido recepcion
        ON recepcion.idPedidoDespachado=despachado.idPedidoDespachado
      WHERE despachado.idPedidoDespachado IS NULL OR recepcion.idPedidoDespachado IS NOT NULL;`);
    return r.recordset[0] ? pedidoConRecepcion(r.recordset[0]) : null;
  }

  public async confirmar(): Promise<void> {
    throw new ErrorAplicacion(409, 'HISTORIAL_CANCELACIONES', 'Este historial conserva cancelaciones SAP; no registra recepciones físicas.');
  }
}

export const cancelacionesSap = new CancelacionSapHistorial();
