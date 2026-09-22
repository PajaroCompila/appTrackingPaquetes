import sql from 'mssql';
import { consultarSap } from '../../infraestructura/sql/consultaSap.js';
import type { DetallePedido, FiltrosPedidos, PaginaPedidos, PedidoResumen } from './pedido.interface.js';
import { GRUPOS_CLIENTE_SAP_PERMITIDOS_SQL } from './gruposClienteSap.js';
import { NOMBRES_VENDEDORES_ESPECIALES } from './pedidoEspecial.js';

interface FilaSap {
  docEntry: number; docNum: number; nombreVendedor: string | null;
  fechaHoraPedido: string | null; fechaEntradaOrigen: string | null;
  codigoUsuarioOrigen: string | null; usuarioUltimaModificacion: string | null;
  fechaUltimaModificacion: string | null; totalRegistros: number;
}
interface LineaSap {
  docEntry: number; numeroLinea: number; codigoArticulo: string | null; descripcion: string | null;
  cantidad: number | null; codigoAlmacen: string | null; nombreAlmacen: string | null;
}

export interface IPedidoSapRepositorio {
  buscarPedidos(filtros: FiltrosPedidos): Promise<PaginaPedidos>;
  obtenerDetallePedido(docEntry: string, codigosAlmacen?: string[]): Promise<DetallePedido | null>;
}

const texto = (valor: string | null): string | null => valor?.trim() || null;
const USUARIOS_SAP_ESPECIALES = ['TALLER01', 'SVENTA10', 'SVENTA11', 'SVENTA12'] as const;
const usuariosSapEspeciales = new Set<string>(USUARIOS_SAP_ESPECIALES);

export function esUsuarioSapEspecial(codigoUsuario: string | null | undefined): boolean {
  return usuariosSapEspeciales.has(codigoUsuario?.trim().toUpperCase() ?? '');
}

export class PedidoSapRepositorio implements IPedidoSapRepositorio {
  public async buscarPedidos(filtros: FiltrosPedidos): Promise<PaginaPedidos> {
    const codigos = filtros.codigosAlmacen ?? [];
    const parametros = codigos.map((_, i) => `@codigoAlmacen${i}`);
    const filtroBodega = codigos.length ? `AND linea.[WhsCode] IN (${parametros.join(', ')})` : '';
    const cantidadConsulta = filtros.cantidadPorPagina + 1;
    const coincidenciaVendedorEspecial = `(${NOMBRES_VENDEDORES_ESPECIALES.map((_, indice) =>
      `UPPER(ISNULL(v.[SlpName], '')) LIKE @vendedorEspecial${indice}`).join(' OR ')})`;
    const coincidenciaUsuarioEspecial = `UPPER(ISNULL(creador.[USER_CODE], '')) IN (${USUARIOS_SAP_ESPECIALES
      .map((_, indice) => `@usuarioEspecial${indice}`).join(', ')})`;
    const coincidenciaEspecial = `(${coincidenciaVendedorEspecial} OR ${coincidenciaUsuarioEspecial})`;
    const filtroClasificacion = filtros.clasificacion === 'especial'
      ? `AND ${coincidenciaEspecial}`
      : filtros.clasificacion === 'normal' ? `AND NOT ${coincidenciaEspecial}` : '';
    const orden = filtros.orden === 'desc' ? 'DESC' : 'ASC';
    const resultado = await consultarSap<FilaSap>(`
        SELECT o.[DocEntry] AS docEntry, o.[DocNum] AS docNum,
          v.[SlpName] AS nombreVendedor,
          CONVERT(char(19), DATEADD(minute, (o.[DocTime] / 100) * 60 + (o.[DocTime] % 100),
            CONVERT(datetime2, CONVERT(date, o.[DocDate]))), 126) AS fechaHoraPedido,
          CONVERT(char(19), DATEADD(second,
            (ISNULL(o.[CreateTS], 0) / 10000) * 3600
              + ((ISNULL(o.[CreateTS], 0) / 100) % 100) * 60
              + (ISNULL(o.[CreateTS], 0) % 100),
            CONVERT(datetime2, CONVERT(date, o.[CreateDate]))), 126) AS fechaEntradaOrigen,
          creador.[USER_CODE] AS codigoUsuarioOrigen,
          COALESCE(NULLIF(LTRIM(RTRIM(modificador.[U_NAME])), ''), modificador.[USER_CODE])
            AS usuarioUltimaModificacion,
          CONVERT(char(19), DATEADD(second,
            (ISNULL(o.[UpdateTS], 0) / 10000) * 3600
              + ((ISNULL(o.[UpdateTS], 0) / 100) % 100) * 60
              + (ISNULL(o.[UpdateTS], 0) % 100),
            CONVERT(datetime2, CONVERT(date, o.[UpdateDate]))), 126) AS fechaUltimaModificacion,
          COUNT_BIG(*) OVER() AS totalRegistros
        FROM [dbo].[ORDR] o
        INNER JOIN [dbo].[OCRD] cliente ON cliente.[CardCode] = o.[CardCode]
        LEFT JOIN [dbo].[OSLP] v ON v.[SlpCode] = o.[SlpCode]
        LEFT JOIN [dbo].[OUSR] creador ON creador.[USERID] = o.[UserSign]
        LEFT JOIN [dbo].[OUSR] modificador ON modificador.[USERID] = o.[UserSign2]
        WHERE o.[U_SO1_01RETAILONE] = @creadoRetailOne
          AND cliente.[GroupCode] IN (${GRUPOS_CLIENTE_SAP_PERMITIDOS_SQL})
          AND o.[CANCELED] = @noCancelado AND o.[DocStatus] = @estadoAbierto
          AND (@numeroPedido IS NULL OR o.[DocNum] = TRY_CONVERT(int, @numeroPedido))
          AND (@fechaDesde IS NULL OR o.[DocDate] >= @fechaDesde)
          AND (@fechaHasta IS NULL OR o.[DocDate] < DATEADD(day, 1, @fechaHasta))
          AND EXISTS (SELECT 1 FROM [dbo].[RDR1] linea WHERE linea.[DocEntry] = o.[DocEntry]
            AND linea.[LineStatus] = @estadoAbierto AND linea.[OpenQty] > 0 ${filtroBodega})
          ${filtroClasificacion}
        ORDER BY o.[DocDate] ${orden}, o.[DocTime] ${orden}, o.[DocEntry] ${orden}
        OFFSET @desplazamiento ROWS FETCH NEXT @cantidadConsulta ROWS ONLY;
      `, (r) => {
      r.input('creadoRetailOne', sql.Char(1), 'N').input('noCancelado', sql.Char(1), 'N')
        .input('estadoAbierto', sql.Char(1), 'O').input('numeroPedido', sql.NVarChar(20), filtros.numeroPedido ?? null)
        .input('fechaDesde', sql.Date, filtros.fechaDesde ?? null).input('fechaHasta', sql.Date, filtros.fechaHasta ?? null)
        .input('desplazamiento', sql.Int, (filtros.pagina - 1) * filtros.cantidadPorPagina)
        .input('cantidadConsulta', sql.Int, cantidadConsulta);
      codigos.forEach((c, i) => r.input(`codigoAlmacen${i}`, sql.NVarChar(16), c));
      NOMBRES_VENDEDORES_ESPECIALES.forEach((nombre, indice) =>
        r.input(`vendedorEspecial${indice}`, sql.NVarChar(30), `%${nombre}%`));
      USUARIOS_SAP_ESPECIALES.forEach((usuario, indice) =>
        r.input(`usuarioEspecial${indice}`, sql.NVarChar(30), usuario));
      return r;
    });
    const cabeceras = resultado.recordset.slice(0, filtros.cantidadPorPagina);
    const pedidos = await this.agregarLineas(cabeceras, codigos);
    return { pedidos, pagina: filtros.pagina, cantidadPorPagina: filtros.cantidadPorPagina,
      totalRegistros: Number(resultado.recordset[0]?.totalRegistros ?? 0),
      hayMas: resultado.recordset.length > filtros.cantidadPorPagina };
  }

  private async agregarLineas(cabeceras: FilaSap[], codigos: string[]): Promise<PedidoResumen[]> {
    if (!cabeceras.length) return [];
    const docs = cabeceras.map((_, i) => `@docEntry${i}`);
    const almacenes = codigos.map((_, i) => `@codigoAlmacen${i}`);
    const resultado = await consultarSap<LineaSap>(`
        SELECT linea.[DocEntry] AS docEntry, linea.[LineNum] AS numeroLinea,
          linea.[ItemCode] AS codigoArticulo,
          linea.[Dscription] AS descripcion, linea.[OpenQty] AS cantidad,
          linea.[WhsCode] AS codigoAlmacen, almacen.[WhsName] AS nombreAlmacen
        FROM [dbo].[RDR1] linea LEFT JOIN [dbo].[OWHS] almacen ON almacen.[WhsCode] = linea.[WhsCode]
        WHERE linea.[DocEntry] IN (${docs.join(', ')}) AND linea.[LineStatus] = @estadoAbierto
          AND linea.[OpenQty] > 0 ${codigos.length ? `AND linea.[WhsCode] IN (${almacenes.join(', ')})` : ''}
        ORDER BY linea.[DocEntry], linea.[LineNum];
      `, (r) => { r.input('estadoAbierto', sql.Char(1), 'O');
        cabeceras.forEach((c, i) => r.input(`docEntry${i}`, sql.Int, c.docEntry));
        codigos.forEach((c, i) => r.input(`codigoAlmacen${i}`, sql.NVarChar(16), c)); return r; });
    return cabeceras.map((c) => {
      const articulos = resultado.recordset.filter((l) => l.docEntry === c.docEntry).map((l) => ({
        identificadorDetalle: String(l.numeroLinea),
        codigoArticulo: texto(l.codigoArticulo), descripcion: texto(l.descripcion), cantidad: l.cantidad,
        codigoAlmacen: texto(l.codigoAlmacen), nombreAlmacen: texto(l.nombreAlmacen),
      }));
      return { idOrigen: `SAP:${c.docEntry}`, origenPedido: 'SAP', creadoEnR1: false,
        sapDocEntry: String(c.docEntry), folioPedido: `SAP:${c.docEntry}`, numeroPedido: String(c.docNum),
        codigoVenta: null, codigoVendedor: null, nombreVendedor: texto(c.nombreVendedor),
        codigosAlmacen: [...new Set(articulos.map((a) => a.codigoAlmacen).filter((x): x is string => !!x))],
        nombresBodega: [...new Set(articulos.map((a) => a.nombreAlmacen).filter((x): x is string => !!x))].join(', ') || null,
        fechaHoraPedido: c.fechaHoraPedido, fechaEntradaOrigen: c.fechaEntradaOrigen,
        codigoUsuarioOrigen: texto(c.codigoUsuarioOrigen),
        usuarioUltimaModificacion: texto(c.usuarioUltimaModificacion),
        fechaUltimaModificacion: c.fechaUltimaModificacion,
        esEspecial: esUsuarioSapEspecial(c.codigoUsuarioOrigen),
        codigoEstadoVenta: 'A', codigoSincronizacion: null, articulos };
    });
  }

  public async obtenerDetallePedido(docEntry: string, codigosAlmacen: string[] = []): Promise<DetallePedido | null> {
    const pagina = await this.buscarPedidos({ numeroPedido: undefined, codigosAlmacen, pagina: 1, cantidadPorPagina: 1000 });
    const cabecera = pagina.pedidos.find((p) => p.sapDocEntry === docEntry);
    if (!cabecera) return null;
    return { cabecera, partidas: cabecera.articulos.map((a, i) => ({ numeroPartida: String(i + 1),
      codigoArticulo: a.codigoArticulo, descripcionArticulo: a.descripcion, cantidadSolicitada: a.cantidad,
      codigoAlmacen: a.codigoAlmacen, nombreAlmacen: a.nombreAlmacen, codigoEstadoEntrega: 'A' })) };
  }
}
