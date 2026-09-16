import sql from 'mssql';
import { obtenerPoolPedidosBodega } from '../../infraestructura/sql/conexionPedidosBodega.js';
import { esVendedorEspecialSinSla } from '../pedidos/pedidoSla.js';
import type { ArticuloHistorial, FiltrosHistorial, PaginaArticulosHistorial, PaginaHistorial, PedidoHistorial } from './historial.interface.js';
import type { EntregaSapPersistida, EntregaSapPublica } from './entregaSap.interface.js';

export interface ControlEntregasSap {
  ultimoDocEntry: number; anteriorDocEntry: number; revisionDocEntry: number; ultimaFacturaDocEntry: number;
}
interface FilaLocal { datos: string; detectadoEn: Date; lineNum?: number; total?: number }

export function proyectarEntregaSap(e: EntregaSapPersistida, detectadoEn: Date, rol?: string): PedidoHistorial {
  const bases = [...new Map(e.lineas.map(l => [`${l.baseType}:${l.baseEntry}:${l.baseLine}`, {
    baseType: l.baseType, baseEntry: l.baseEntry, baseLine: l.baseLine, numeroDocumento: l.numeroBase,
  }])).values()];
  const tipos = new Set(bases.map(b => b.baseType));
  const entregaSap: EntregaSapPublica = {
    empresa: e.empresa, objType: 15, docEntry: e.docEntry, docNum: e.docNum,
    tipo: tipos.size > 1 ? 'Entrega con bases mixtas' : tipos.has(17) ? 'Entrega desde pedido'
      : tipos.has(23) ? 'Entrega desde cotización' : tipos.has(-1) ? 'Entrega sin documento base'
      : 'Entrega desde otro documento',
    fechaEntrega: e.fechaEntrega, referenciaR1: e.referenciaR1, bases,
    facturas: [...new Map(e.facturas.map(f => [f.docEntry, { docEntry: f.docEntry, docNum: f.docNum }])).values()],
  };
  const articulos = e.lineas.filter(l => l.cantidadEntregada > 0).map(l => ({
    identificadorDetalle: String(l.lineNum), codigoArticulo: l.itemCode, descripcion: l.descripcion,
    cantidad: l.cantidadEntregada, codigoAlmacen: l.whsCode, nombreAlmacen: l.nombreAlmacen,
    usuarioAsignado: null,
  }));
  const pedido: PedidoHistorial = {
    idOrigen: e.idOrigen, origenPedido: 'SAP', creadoEnR1: false, sapDocEntry: String(e.docEntry),
    folioPedido: e.docNum, numeroPedido: e.docNum, codigoVenta: null, codigoVendedor: null,
    nombreVendedor: e.nombreVendedor, codigosAlmacen: [...new Set(articulos.map(a => a.codigoAlmacen))],
    nombresBodega: [...new Set(articulos.map(a => a.nombreAlmacen).filter((n): n is string => n !== null))].join(', '),
    fechaHoraPedido: e.fechaEntrega, codigoEstadoVenta: null, codigoSincronizacion: null,
    estadoLocal: 'VALIDADO', despachadoEn: null, usuarioDespacho: null,
    validadoDetectadoEn: detectadoEn.toISOString(), responsablesAsignados: [], articulos,
    estadoHistorial: e.estadoFinanciero, entregaSap,
  };
  if (rol === 'ADMINISTRADOR' && e.estadoFinanciero === 'Entregado, Sin factura') {
    pedido.auditoriaSap = { usuarioRegistrador: e.usuarioRegistrador, nombreRegistrador: e.nombreRegistrador,
      documentoEntrega: e.docNum, fechaEntrega: e.fechaEntrega };
  }
  return pedido;
}

export class EntregaSapRepositorio {
  public async control(): Promise<ControlEntregasSap> {
    const resultado = await obtenerPoolPedidosBodega().request().query<ControlEntregasSap>(
      'SELECT ultimoDocEntry, anteriorDocEntry, revisionDocEntry, ultimaFacturaDocEntry FROM dbo.ControlEntregasSap WHERE clave=1');
    if (!resultado.recordset[0]) throw new Error('Falta la migración de entregas SAP.');
    return resultado.recordset[0];
  }

  public async conocidas(desde: number, limite = 50): Promise<number[]> {
    const resultado = await obtenerPoolPedidosBodega().request().input('desde', sql.Int, desde)
      .input('limite', sql.Int, limite).query<{ docEntry: number }>(`
        SELECT TOP (@limite) docEntry FROM dbo.EntregaSapHistorial WHERE docEntry > @desde ORDER BY docEntry
      `);
    return resultado.recordset.map(f => f.docEntry);
  }

  public async guardar(entregas: EntregaSapPersistida[], control?: ControlEntregasSap,
    esperado?: ControlEntregasSap): Promise<void> {
    const lineas = entregas.flatMap(e => e.lineas.map(l => ({ ...l, idOrigen: e.idOrigen })));
    await obtenerPoolPedidosBodega().request()
      .input('entregas', sql.NVarChar(sql.MAX), JSON.stringify(entregas.map(e => ({ ...e,
        esEspecial: esVendedorEspecialSinSla(e.nombreVendedor) }))))
      .input('lineas', sql.NVarChar(sql.MAX), JSON.stringify(lineas))
      .input('control', sql.NVarChar(sql.MAX), control ? JSON.stringify(control) : null)
      .input('esperado', sql.NVarChar(sql.MAX), esperado ? JSON.stringify(esperado) : null).query(`
      IF DB_NAME() <> N'PedidosBodega' THROW 51000, 'Base no autorizada.', 1;
      SET XACT_ABORT ON;
      BEGIN TRANSACTION;
      BEGIN TRY
        IF @esperado IS NOT NULL AND NOT EXISTS (
          SELECT 1 FROM dbo.ControlEntregasSap WITH(UPDLOCK,HOLDLOCK) WHERE clave=1
            AND ultimoDocEntry=CONVERT(int,JSON_VALUE(@esperado,'$.ultimoDocEntry'))
            AND anteriorDocEntry=CONVERT(int,JSON_VALUE(@esperado,'$.anteriorDocEntry'))
            AND revisionDocEntry=CONVERT(int,JSON_VALUE(@esperado,'$.revisionDocEntry'))
            AND ultimaFacturaDocEntry=CONVERT(int,JSON_VALUE(@esperado,'$.ultimaFacturaDocEntry'))
        ) THROW 51001, 'Otro sincronizador avanzó el cursor; reintentar.', 1;
        DECLARE @cabeceras TABLE(idOrigen varchar(100), docEntry int, fechaEntrega datetime2(3),
          estadoLogistico varchar(30), estadoFinanciero nvarchar(40), datos nvarchar(max));
        INSERT @cabeceras SELECT JSON_VALUE(value,'$.idOrigen'), JSON_VALUE(value,'$.docEntry'),
          JSON_VALUE(value,'$.fechaEntrega'), JSON_VALUE(value,'$.estadoLogistico'),
          JSON_VALUE(value,'$.estadoFinanciero'), value FROM OPENJSON(@entregas);
        DECLARE @cambios TABLE(idOrigen varchar(100), estadoLogistico varchar(30),
          estadoFinanciero nvarchar(40), facturas nvarchar(max));
        INSERT @cambios SELECT c.idOrigen,c.estadoLogistico,c.estadoFinanciero,JSON_QUERY(c.datos,'$.facturas')
          FROM @cabeceras c LEFT JOIN dbo.EntregaSapHistorial h WITH(UPDLOCK,HOLDLOCK) ON h.idOrigen=c.idOrigen
          WHERE h.idOrigen IS NULL OR h.estadoLogistico<>c.estadoLogistico OR h.estadoFinanciero<>c.estadoFinanciero
            OR JSON_QUERY(h.datos,'$.facturas')<>JSON_QUERY(c.datos,'$.facturas');
        UPDATE h WITH(UPDLOCK, HOLDLOCK) SET estadoLogistico=c.estadoLogistico,
          estadoFinanciero=c.estadoFinanciero, datos=c.datos, revisadoEn=SYSUTCDATETIME()
          FROM dbo.EntregaSapHistorial h INNER JOIN @cabeceras c ON c.idOrigen=h.idOrigen;
        INSERT dbo.EntregaSapHistorial(idOrigen,docEntry,fechaEntrega,estadoLogistico,estadoFinanciero,datos)
          SELECT c.* FROM @cabeceras c WHERE NOT EXISTS
            (SELECT 1 FROM dbo.EntregaSapHistorial h WITH(UPDLOCK,HOLDLOCK) WHERE h.idOrigen=c.idOrigen);
        INSERT dbo.EntregaSapHistorialCambio(idOrigen,estadoLogistico,estadoFinanciero,facturas)
          SELECT * FROM @cambios;
        DECLARE @detalle TABLE(idOrigen varchar(100), lineNum int, whsCode nvarchar(16), baseType int,
          baseEntry int, baseLine int, invQty decimal(19,6), cantidadEntregada decimal(19,6), datos nvarchar(max));
        INSERT @detalle SELECT JSON_VALUE(value,'$.idOrigen'), JSON_VALUE(value,'$.lineNum'),
          JSON_VALUE(value,'$.whsCode'), JSON_VALUE(value,'$.baseType'), JSON_VALUE(value,'$.baseEntry'),
          JSON_VALUE(value,'$.baseLine'), JSON_VALUE(value,'$.invQty'), JSON_VALUE(value,'$.cantidadEntregada'), value
          FROM OPENJSON(@lineas);
        UPDATE h WITH(UPDLOCK,HOLDLOCK) SET datos=l.datos, whsCode=l.whsCode, baseType=l.baseType,
          baseEntry=l.baseEntry, baseLine=l.baseLine, invQty=l.invQty, cantidadEntregada=l.cantidadEntregada
          FROM dbo.EntregaSapHistorialLinea h INNER JOIN @detalle l ON l.idOrigen=h.idOrigen AND l.lineNum=h.lineNum;
        INSERT dbo.EntregaSapHistorialLinea SELECT l.* FROM @detalle l WHERE NOT EXISTS
          (SELECT 1 FROM dbo.EntregaSapHistorialLinea h WITH(UPDLOCK,HOLDLOCK)
            WHERE h.idOrigen=l.idOrigen AND h.lineNum=l.lineNum);
        IF @control IS NOT NULL UPDATE dbo.ControlEntregasSap SET
          ultimoDocEntry=JSON_VALUE(@control,'$.ultimoDocEntry'),
          anteriorDocEntry=JSON_VALUE(@control,'$.anteriorDocEntry'),
          revisionDocEntry=JSON_VALUE(@control,'$.revisionDocEntry'),
          ultimaFacturaDocEntry=JSON_VALUE(@control,'$.ultimaFacturaDocEntry') WHERE clave=1;
        COMMIT;
      END TRY
      BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        THROW;
      END CATCH
    `);
  }

  private async leer(filtros: FiltrosHistorial, porArticulo = false): Promise<{ registros: PedidoHistorial[]; total: number }> {
    const r = obtenerPoolPedidosBodega().request().input('desde', sql.Date, filtros.fechaDesde)
      .input('hasta', sql.Date, filtros.fechaHasta).input('numero', sql.NVarChar(100), filtros.numeroPedido || null)
      .input('clasificacion', sql.VarChar(8), filtros.clasificacion ?? null)
      .input('inicio', sql.Int, (filtros.pagina-1)*filtros.cantidadPorPagina)
      .input('cantidad', sql.Int, filtros.cantidadPorPagina);
    const almacenes = filtros.codigosAlmacen.map((codigo, i) => {
      r.input(`almacen${i}`, sql.NVarChar(16), codigo); return `@almacen${i}`;
    });
    const origenYFiltros = `FROM dbo.EntregaSapHistorial h
      ${porArticulo ? 'INNER JOIN dbo.EntregaSapHistorialLinea linea ON linea.idOrigen=h.idOrigen AND linea.cantidadEntregada>0' : ''}
      WHERE h.estadoLogistico='SALIDA_COMPROBADA'
        AND h.fechaEntrega >= @desde AND h.fechaEntrega < DATEADD(day,1,@hasta)
        AND (@numero IS NULL OR JSON_VALUE(h.datos,'$.docNum') LIKE '%' + @numero + '%')
        AND (@clasificacion IS NULL
          OR (@clasificacion='especial' AND JSON_VALUE(h.datos,'$.esEspecial')='true')
          OR (@clasificacion='normal' AND ISNULL(JSON_VALUE(h.datos,'$.esEspecial'),'false')='false'))
        ${almacenes.length ? porArticulo ? `AND linea.whsCode IN (${almacenes.join(',')})` : `AND EXISTS(SELECT 1 FROM dbo.EntregaSapHistorialLinea l
          WHERE l.idOrigen=h.idOrigen AND l.cantidadEntregada>0 AND l.whsCode IN (${almacenes.join(',')}))` : ''}
    `;
    const resultado = await r.query<FilaLocal>(`
      SELECT h.datos, h.detectadoEn ${porArticulo ? ',linea.lineNum' : ''} ${origenYFiltros}
      ORDER BY h.fechaEntrega DESC, h.docEntry DESC ${porArticulo ? ',linea.lineNum' : ''}
      OFFSET @inicio ROWS FETCH NEXT @cantidad ROWS ONLY;
      SELECT COUNT(*) AS total ${origenYFiltros};
    `);
    const registros = resultado.recordset.map(f => {
        const p = proyectarEntregaSap(JSON.parse(f.datos) as EntregaSapPersistida, f.detectadoEn);
        if (porArticulo) p.articulos = p.articulos.filter(a => a.identificadorDetalle === String(f.lineNum));
        if (filtros.codigosAlmacen.length) p.articulos = p.articulos.filter(a =>
          a.codigoAlmacen !== null && filtros.codigosAlmacen.includes(a.codigoAlmacen));
        p.codigosAlmacen = [...new Set(p.articulos.map(a => a.codigoAlmacen).filter((c): c is string => c !== null))];
        p.nombresBodega = [...new Set(p.articulos.map(a => a.nombreAlmacen).filter((c): c is string => c !== null))].join(', ');
        return p;
      });
    const conjuntos = resultado.recordsets as sql.IRecordSet<FilaLocal>[];
    return { registros, total: Number(conjuntos[1]?.[0]?.total ?? 0) };
  }

  public async buscar(filtros: FiltrosHistorial): Promise<PaginaHistorial> {
    const { registros, total } = await this.leer(filtros);
    const inicio = (filtros.pagina-1)*filtros.cantidadPorPagina;
    return { registros, totalRegistros: total,
      pagina: filtros.pagina, cantidadPorPagina: filtros.cantidadPorPagina, hayMas: inicio+filtros.cantidadPorPagina < total };
  }

  public async buscarArticulos(filtros: FiltrosHistorial): Promise<PaginaArticulosHistorial> {
    const { registros: pedidos, total } = await this.leer(filtros, true);
    const todos: ArticuloHistorial[] = pedidos.flatMap(p => p.articulos.map(a => ({ ...a,
      identificadorDetalle: a.identificadorDetalle ?? null, idOrigen: p.idOrigen, numeroPedido: p.numeroPedido,
      fechaHoraPedido: p.fechaHoraPedido, nombreVendedor: p.nombreVendedor,
      estadoHistorial: p.estadoHistorial, entregaSap: p.entregaSap })));
    const inicio = (filtros.pagina-1)*filtros.cantidadPorPagina;
    return { registros: todos, totalRegistros: total,
      pagina: filtros.pagina, cantidadPorPagina: filtros.cantidadPorPagina, hayMas: inicio+filtros.cantidadPorPagina < total };
  }

  public async obtener(idOrigen: string, rol?: string): Promise<PedidoHistorial | null> {
    const resultado = await obtenerPoolPedidosBodega().request().input('id', sql.VarChar(100), idOrigen)
      .query<FilaLocal>(`SELECT datos, detectadoEn FROM dbo.EntregaSapHistorial
        WHERE idOrigen=@id AND estadoLogistico='SALIDA_COMPROBADA'`);
    const f = resultado.recordset[0];
    return f ? proyectarEntregaSap(JSON.parse(f.datos) as EntregaSapPersistida, f.detectadoEn, rol) : null;
  }
}
