import sql from 'mssql';
import { createHash } from 'node:crypto';
import { obtenerPoolPedidosBodega } from '../../infraestructura/sql/conexionPedidosBodega.js';
import { ErrorAplicacion } from '../../compartido/errores/errorAplicacion.js';
import type { IdentidadAutenticada } from '../autenticacion/autenticacion.interface.js';
import type { EstadoDevolucion, PedidoDevuelto } from './pedidoDevueltoServicio.js';

export interface FiltrosDevolucion {
  numeroPedido?: string; fechaDesde?: string; fechaHasta?: string;
  codigosAlmacen: string[]; estado: 'todos' | 'pendiente' | 'parcial' | 'devuelto';
  vista: 'pedido' | 'articulos'; pagina: number; cantidadPorPagina: number;
}
export interface SeleccionDevolucion { idClave: string; identificadorDetalle: string }
export interface EventoDevolucion {
  idPedidoDespachado: number; evento: string; motivo: string;
  fechaCancelacion: Date; evidencia: Record<string, unknown>;
}
export interface CandidatoDevolucion {
  idPedidoDespachado: number; idOrigen: string; origenPedido: 'R1' | 'SAP';
  folioPedido: string | null; sapDocEntry: string | null;
}
interface Cabecera extends Omit<PedidoDevuelto, 'lineas' | 'fechaCancelacion' | 'fechaDespacho' | 'fechaDevolucionCompleta'> {
  fechaCancelacion: Date; fechaDespacho: Date; fechaDevolucionCompleta: Date | null;
}
interface FilaLinea {
  idClave: string; identificadorDetalle: string; codigoArticulo: string | null;
  descripcion: string | null; cantidad: number; codigoAlmacen: string;
  estado: EstadoDevolucion; cantidadRecibida: number; recibidoPor: string | null; recibidoEn: Date | null;
}
const guardiaLocal = "IF DB_NAME() <> N'PedidosBodega' THROW 51000, 'Base no autorizada.', 1;";
const estados = { pendiente: 'PENDIENTE DE DEVOLUCIÓN', parcial: 'DEVOLUCIÓN PARCIAL', devuelto: 'DEVUELTO' };
export const claveEventoDevolucion = (id: number, evento: string): string =>
  createHash('sha256').update(`${id}\u0000${evento}`).digest('hex');

export class PedidoDevueltoRepositorio {
  private async ensamblar(cabeceras: Cabecera[], lineas?: FilaLinea[]): Promise<PedidoDevuelto[]> {
    if (!cabeceras.length) return [];
    const detalles = lineas ?? (await obtenerPoolPedidosBodega().request()
      .input('ids', sql.NVarChar(sql.MAX), JSON.stringify(cabeceras.map(c => c.idClave)))
      .query<FilaLinea>(`SELECT d.*,u.nombreVisible recibidoPor FROM dbo.DevolucionPedidoDetalle d
        LEFT JOIN dbo.UsuarioAplicacion u ON u.idUsuario=d.recibidoPorUsuarioId
        WHERE d.idClave IN (SELECT value FROM OPENJSON(@ids)) ORDER BY d.idDetalleDespachado`)).recordset;
    return cabeceras.map(c => ({ ...c, fueDespachado: true,
      fechaCancelacion: c.fechaCancelacion.toISOString(), fechaDespacho: c.fechaDespacho.toISOString(),
      fechaDevolucionCompleta: c.fechaDevolucionCompleta?.toISOString() ?? null,
      progreso: c.totalLineas ? Math.round(100 * (c.lineasRecibidas ?? 0) / c.totalLineas) : 0,
      lineas: detalles.filter(d => d.idClave === c.idClave).map(d => ({
        identificadorDetalle: d.identificadorDetalle, codigoArticulo: d.codigoArticulo,
        descripcion: d.descripcion, cantidad: Number(d.cantidad), codigoAlmacen: d.codigoAlmacen,
        estado: d.estado, cantidadRecibida: Number(d.cantidadRecibida),
        recibidoPor: d.recibidoPor, recibidoEn: d.recibidoEn?.toISOString() ?? null,
      })),
    }));
  }

  public async listar(f: FiltrosDevolucion): Promise<{ datos: PedidoDevuelto[]; total: number }> {
    const peticion = obtenerPoolPedidosBodega().request()
      .input('numero', sql.NVarChar(100), f.numeroPedido || null)
      .input('desde', sql.VarChar(10), f.fechaDesde || null).input('hasta', sql.VarChar(10), f.fechaHasta || null)
      .input('almacenes', sql.NVarChar(sql.MAX), JSON.stringify(f.codigosAlmacen))
      .input('estado', sql.NVarChar(40), f.estado === 'todos' ? null : estados[f.estado])
      .input('inicio', sql.Int, (f.pagina - 1) * f.cantidadPorPagina).input('cantidad', sql.Int, f.cantidadPorPagina);
    const filtroHeader = `(@numero IS NULL OR h.numeroPedido=@numero OR h.folioPedido=@numero)
      AND (@desde IS NULL OR h.fechaCancelacion>=DATEADD(hour,6,CONVERT(datetime2,@desde)))
      AND (@hasta IS NULL OR h.fechaCancelacion<DATEADD(hour,6,DATEADD(day,1,CONVERT(datetime2,@hasta))))
      AND (@estado IS NULL OR h.estado=@estado)`;
    const filtroLinea = `(NOT EXISTS(SELECT 1 FROM OPENJSON(@almacenes))
      OR d.codigoAlmacen IN (SELECT value FROM OPENJSON(@almacenes)))`;
    if (f.vista === 'pedido') {
      const filtro = `${filtroHeader} AND EXISTS(SELECT 1 FROM dbo.DevolucionPedidoDetalle d WHERE d.idClave=h.idClave AND ${filtroLinea})`;
      const res = await peticion.query<Cabecera>(`SELECT COUNT(*) total FROM dbo.DevolucionPedido h WHERE ${filtro};
        SELECT h.* FROM dbo.DevolucionPedido h WHERE ${filtro} ORDER BY h.fechaCancelacion DESC,h.idClave
        OFFSET @inicio ROWS FETCH NEXT @cantidad ROWS ONLY;`);
      return { datos: await this.ensamblar(res.recordsets[1] as Cabecera[]), total: Number((res.recordsets[0] as unknown as {total:number}[])[0]?.total ?? 0) };
    }
    const res = await peticion.query<FilaLinea>(`SELECT COUNT(*) total FROM dbo.DevolucionPedidoDetalle d
      JOIN dbo.DevolucionPedido h ON h.idClave=d.idClave WHERE ${filtroHeader} AND ${filtroLinea};
      SELECT d.*,u.nombreVisible recibidoPor FROM dbo.DevolucionPedidoDetalle d
      JOIN dbo.DevolucionPedido h ON h.idClave=d.idClave LEFT JOIN dbo.UsuarioAplicacion u ON u.idUsuario=d.recibidoPorUsuarioId
      WHERE ${filtroHeader} AND ${filtroLinea} ORDER BY h.fechaCancelacion DESC,h.idClave,d.idDetalleDespachado
      OFFSET @inicio ROWS FETCH NEXT @cantidad ROWS ONLY;`);
    const detalles = res.recordsets[1] as FilaLinea[];
    const cabeceras = (await obtenerPoolPedidosBodega().request()
      .input('ids',sql.NVarChar(sql.MAX),JSON.stringify([...new Set(detalles.map(d => d.idClave))]))
      .query<Cabecera>('SELECT * FROM dbo.DevolucionPedido WHERE idClave IN (SELECT value FROM OPENJSON(@ids))')).recordset;
    return { datos: await this.ensamblar(cabeceras, detalles), total: Number((res.recordsets[0] as unknown as {total:number}[])[0]?.total ?? 0) };
  }

  public async obtener(idClave: string): Promise<PedidoDevuelto | null> {
    const cabeceras = (await obtenerPoolPedidosBodega().request().input('id',sql.VarChar(64),idClave)
      .query<Cabecera>('SELECT * FROM dbo.DevolucionPedido WHERE idClave=@id')).recordset;
    return (await this.ensamblar(cabeceras))[0] ?? null;
  }

  public async confirmar(seleccion: SeleccionDevolucion[], usuario: IdentidadAutenticada): Promise<void> {
    if (!['ADMINISTRADOR','OPERADOR_BODEGA'].includes(usuario.codigoRol ?? ''))
      throw new ErrorAplicacion(403,'PERMISO_DEVOLUCION','No tenés permiso para confirmar devoluciones.');
    const lineas = [...new Map(seleccion.map(l => [`${l.idClave}\u0000${l.identificadorDetalle}`,l])).values()];
    const t = new sql.Transaction(obtenerPoolPedidosBodega());
    await t.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    try {
      const req = new sql.Request(t).input('seleccion',sql.NVarChar(sql.MAX),JSON.stringify(lineas))
        .input('usuario',sql.UniqueIdentifier,usuario.usuarioId);
      const existentes = (await req.query<FilaLinea>(`SELECT d.* FROM dbo.DevolucionPedidoDetalle d WITH(UPDLOCK,HOLDLOCK)
        JOIN OPENJSON(@seleccion) WITH(idClave varchar(64),identificadorDetalle nvarchar(150)) s
        ON s.idClave=d.idClave AND s.identificadorDetalle=d.identificadorDetalle
        ORDER BY d.idClave,d.identificadorDetalle`)).recordset;
      if (existentes.length !== lineas.length) throw new ErrorAplicacion(404,'LINEA_NO_ENCONTRADA','Una partida ya no está disponible.');
      if (existentes.some(l => !l.codigoAlmacen || (usuario.codigoRol !== 'ADMINISTRADOR'
        && !(usuario.codigosAlmacenVisibles ?? []).some(c => c.toUpperCase() === l.codigoAlmacen.toUpperCase()))))
        throw new ErrorAplicacion(403,'PERMISO_DEVOLUCION','No tenés permiso para confirmar partidas de otra bodega.');
      await req.query(`${guardiaLocal}
        UPDATE d SET estado=N'DEVUELTO',cantidadRecibida=d.cantidad,recibidoPorUsuarioId=@usuario,recibidoEn=SYSUTCDATETIME()
        FROM dbo.DevolucionPedidoDetalle d JOIN OPENJSON(@seleccion)
        WITH(idClave varchar(64),identificadorDetalle nvarchar(150)) s
        ON s.idClave=d.idClave AND s.identificadorDetalle=d.identificadorDetalle WHERE d.recibidoEn IS NULL;
        UPDATE h SET lineasRecibidas=c.recibidas,estado=CASE WHEN c.recibidas=h.totalLineas THEN N'DEVUELTO'
          WHEN c.recibidas>0 THEN N'DEVOLUCIÓN PARCIAL' ELSE N'PENDIENTE DE DEVOLUCIÓN' END,
          fechaDevolucionCompleta=CASE WHEN c.recibidas=h.totalLineas THEN COALESCE(h.fechaDevolucionCompleta,SYSUTCDATETIME()) ELSE NULL END
        FROM dbo.DevolucionPedido h CROSS APPLY(SELECT COUNT(*) recibidas FROM dbo.DevolucionPedidoDetalle d
          WHERE d.idClave=h.idClave AND d.recibidoEn IS NOT NULL)c
        WHERE h.idClave IN(SELECT idClave FROM OPENJSON(@seleccion) WITH(idClave varchar(64)));`);
      await t.commit();
    } catch(e) { await t.rollback(); throw e; }
  }

  public async registrar(e: EventoDevolucion): Promise<void> {
    const clave = claveEventoDevolucion(e.idPedidoDespachado,e.evento);
    await obtenerPoolPedidosBodega().request().input('id',sql.BigInt,e.idPedidoDespachado)
      .input('clave',sql.VarChar(64),clave).input('evento',sql.NVarChar(150),e.evento)
      .input('fecha',sql.DateTime2(3),e.fechaCancelacion).input('motivo',sql.NVarChar(100),e.motivo)
      .input('evidencia',sql.NVarChar(sql.MAX),JSON.stringify(e.evidencia)).query(`${guardiaLocal}
      SET XACT_ABORT ON; BEGIN TRANSACTION;
      IF NOT EXISTS(SELECT 1 FROM dbo.DevolucionPedido WITH(UPDLOCK,HOLDLOCK) WHERE idClave=@clave)
      AND EXISTS(SELECT 1 FROM dbo.PedidoDespachado p WHERE p.idPedidoDespachado=@id
        AND p.estadoLocal IN('DESPACHADO','CERRADO') AND p.entregaDetectadaEn IS NULL AND p.validadoDetectadoEn IS NULL
        AND p.despachadoEn<=@fecha)
      AND EXISTS(SELECT 1 FROM dbo.PedidoDespachadoDetalle WHERE idPedidoDespachado=@id)
      AND NOT EXISTS(SELECT 1 FROM dbo.PedidoDespachado p JOIN dbo.ConciliacionEntregaPedido c ON c.idPedido=p.idOrigen
        JOIN dbo.EntregaSapHistorial h ON h.idOrigen=c.idEntrega
        WHERE p.idPedidoDespachado=@id AND c.activa=1 AND h.estadoLogistico='SALIDA_COMPROBADA')
      AND NOT EXISTS(SELECT 1 FROM dbo.PedidoDespachadoDetalle WHERE idPedidoDespachado=@id
        AND (codigoAlmacen IS NULL OR LTRIM(RTRIM(codigoAlmacen))='' OR cantidad<=0 OR identificadorDetalle LIKE 'LEGACY:%' OR transferidoEn>@fecha))
      BEGIN
        INSERT dbo.DevolucionPedido(idClave,idPedidoDespachado,evento,idOrigen,origenPedido,folioPedido,numeroPedido,
          nombreVendedor,fechaDespacho,fechaCancelacion,motivo,evidencia,totalLineas)
        SELECT @clave,p.idPedidoDespachado,@evento,p.idOrigen,p.origenPedido,p.folioPedido,p.numeroPedido,
          p.nombreVendedor,p.despachadoEn,@fecha,@motivo,@evidencia,(SELECT COUNT(*) FROM dbo.PedidoDespachadoDetalle WHERE idPedidoDespachado=@id)
        FROM dbo.PedidoDespachado p WHERE p.idPedidoDespachado=@id;
        INSERT dbo.DevolucionPedidoDetalle(idClave,idDetalleDespachado,identificadorDetalle,codigoArticulo,descripcion,cantidad,codigoAlmacen)
        SELECT @clave,idDetalle,identificadorDetalle,codigoArticulo,descripcion,cantidad,codigoAlmacen
        FROM dbo.PedidoDespachadoDetalle WHERE idPedidoDespachado=@id;
      END;
      COMMIT;`);
  }

  public async candidatos(): Promise<CandidatoDevolucion[]> {
    return (await obtenerPoolPedidosBodega().request().query<CandidatoDevolucion>(`SELECT TOP 50 p.idPedidoDespachado,p.idOrigen,
      p.origenPedido,p.folioPedido,p.sapDocEntry FROM dbo.PedidoDespachado p
      WHERE p.estadoLocal IN('DESPACHADO','CERRADO') AND p.entregaDetectadaEn IS NULL AND p.validadoDetectadoEn IS NULL
      AND p.idPedidoDespachado>(SELECT ultimoId FROM dbo.ControlDevoluciones WHERE clave=1)
      AND NOT EXISTS(SELECT 1 FROM dbo.DevolucionPedido d WHERE d.idPedidoDespachado=p.idPedidoDespachado)
      ORDER BY p.idPedidoDespachado`)).recordset;
  }
  public async avanzar(id: number): Promise<void> {
    await obtenerPoolPedidosBodega().request().input('id',sql.BigInt,id).query(`${guardiaLocal}
      UPDATE dbo.ControlDevoluciones SET ultimoId=@id WHERE clave=1;`);
  }
}
