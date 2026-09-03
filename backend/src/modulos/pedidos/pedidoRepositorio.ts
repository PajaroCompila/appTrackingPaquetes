import sql from 'mssql';
import { ErrorDependenciaDatos } from '../../compartido/errores/errorDependenciaDatos.js';
import { obtenerPoolSistemaOrigen } from '../../infraestructura/sql/conexionSistemaOrigen.js';
import { consultarSistemaOrigen } from '../../infraestructura/sql/consultaSistemaOrigen.js';
import type {
  DetallePedido,
  FiltrosPedidos,
  PaginaPedidos,
  PartidaPedido,
  PedidoResumen,
} from './pedido.interface.js';

interface FilaPedido {
  folioPedido: string;
  numeroPedido: string;
  codigoVenta: string | null;
  codigoVendedor: number | null;
  nombreVendedor: string | null;
  codigosAlmacen: string | null;
  nombresBodega: string | null;
  fechaHoraPedido: string | null;
  codigoEstadoVenta: string | null;
  codigoSincronizacion: string | null;
  totalRegistros: number;
}

interface FilaPartida {
  numeroPartida: number | null;
  codigoArticulo: string | null;
  descripcionArticulo: string | null;
  cantidadSolicitada: number | null;
  codigoAlmacen: string | null;
  nombreAlmacen: string | null;
  codigoEstadoEntrega: string | null;
}

interface FilaArticuloResumen {
  folioPedido: string;
  numeroPartida: number | null;
  codigoArticulo: string | null;
  descripcion: string | null;
  cantidad: number | null;
  codigoAlmacen: string | null;
  nombreAlmacen: string | null;
}

export interface IPedidoRepositorio {
  buscarPedidos(filtros: FiltrosPedidos): Promise<PaginaPedidos>;
  obtenerDetallePedido(folioPedido: string, codigosAlmacen?: string[]): Promise<DetallePedido | null>;
}

function normalizarTexto(valor: string | null): string | null {
  const texto = valor?.trim();
  return texto ? texto : null;
}

function mapearPedido(fila: FilaPedido, codigoFuente = ''): PedidoResumen {
  return {
    idOrigen: codigoFuente ? `R1:${codigoFuente}:${fila.folioPedido}` : `R1:${fila.folioPedido}`,
    origenPedido: 'R1',
    creadoEnR1: true,
    sapDocEntry: null,
    folioPedido: fila.folioPedido,
    numeroPedido: fila.numeroPedido,
    codigoVenta: normalizarTexto(fila.codigoVenta),
    codigoVendedor: fila.codigoVendedor,
    nombreVendedor: normalizarTexto(fila.nombreVendedor),
    codigosAlmacen: fila.codigosAlmacen?.split(',').map((codigo) => codigo.trim()).filter(Boolean) ?? [],
    nombresBodega: normalizarTexto(fila.nombresBodega),
    fechaHoraPedido: fila.fechaHoraPedido,
    codigoEstadoVenta: normalizarTexto(fila.codigoEstadoVenta),
    codigoSincronizacion: normalizarTexto(fila.codigoSincronizacion),
    articulos: [],
  };
}

function mapearPartida(fila: FilaPartida): PartidaPedido {
  return {
    numeroPartida: fila.numeroPartida === null ? null : String(fila.numeroPartida),
    codigoArticulo: normalizarTexto(fila.codigoArticulo),
    descripcionArticulo: normalizarTexto(fila.descripcionArticulo),
    cantidadSolicitada: fila.cantidadSolicitada,
    codigoAlmacen: normalizarTexto(fila.codigoAlmacen),
    nombreAlmacen: normalizarTexto(fila.nombreAlmacen),
    codigoEstadoEntrega: normalizarTexto(fila.codigoEstadoEntrega),
  };
}

function esErrorTemporalSql(error: unknown): boolean {
  if (error instanceof sql.ConnectionError) {
    return true;
  }

  if (error instanceof sql.RequestError) {
    return ['ETIMEOUT', 'ECONNCLOSED', 'ENOTOPEN', 'ESOCKET'].includes(error.code);
  }

  return false;
}

export class PedidoRepositorio implements IPedidoRepositorio {
  public constructor(
    private readonly proveedorPool: () => sql.ConnectionPool = obtenerPoolSistemaOrigen,
    private readonly codigoFuente = '',
  ) {}

  public async buscarPedidos(filtros: FiltrosPedidos): Promise<PaginaPedidos> {
    const cantidadConsulta = filtros.cantidadPorPagina + 1;
    const desplazamiento = (filtros.pagina - 1) * filtros.cantidadPorPagina;
    const codigosAlmacen = filtros.codigosAlmacen ?? [];
    const parametrosAlmacen = codigosAlmacen.map((_, indice) => `@codigoAlmacen${indice}`);
    const condicionAlmacenes = codigosAlmacen.length > 0 ? `
            AND EXISTS (
              SELECT 1
              FROM [dbo].[@SO1_01VENTADETALLE] AS detalle
              WHERE detalle.[U_SO1_FOLIO] = venta.[Name]
                AND detalle.[U_SO1_ALMACEN] IN (${parametrosAlmacen.join(', ')})
            )` : '';

    try {
      const resultado = await consultarSistemaOrigen<FilaPedido>(`
          SELECT
            venta.[Name] AS folioPedido,
            COALESCE(CONVERT(nvarchar(20), venta.[U_SO1_DOCUMENTOSBO]), '') AS numeroPedido,
            venta.[Code] AS codigoVenta,
            venta.[U_SO1_VENDEDOR] AS codigoVendedor,
            vendedor.[SlpName] AS nombreVendedor,
            bodegas.[codigosAlmacen],
            bodegas.[nombresBodega],
            CASE
              WHEN venta.[U_SO1_FECHA] IS NULL OR venta.[U_SO1_HORA] IS NULL THEN NULL
              ELSE CONVERT(char(19), DATEADD(
                minute,
                (venta.[U_SO1_HORA] / 100) * 60 + (venta.[U_SO1_HORA] % 100),
                CONVERT(datetime2, CONVERT(date, venta.[U_SO1_FECHA]))
              ), 126)
            END AS fechaHoraPedido,
            venta.[U_SO1_STATUS] AS codigoEstadoVenta,
            venta.[U_SO1_SINCRONIZADO] AS codigoSincronizacion,
            COUNT_BIG(*) OVER() AS totalRegistros
          FROM [dbo].[@SO1_01VENTA] AS venta
          LEFT JOIN [dbo].[OSLP] AS vendedor
            ON vendedor.[SlpCode] = venta.[U_SO1_VENDEDOR]
          OUTER APPLY (
            SELECT
              STRING_AGG(datosBodega.[codigoAlmacen], ',')
                WITHIN GROUP (ORDER BY datosBodega.[codigoAlmacen]) AS codigosAlmacen,
              STRING_AGG(datosBodega.[nombreAlmacen], ', ')
                WITHIN GROUP (ORDER BY datosBodega.[codigoAlmacen]) AS nombresBodega
            FROM (
              SELECT DISTINCT
                detalleBodega.[U_SO1_ALMACEN] AS codigoAlmacen,
                almacenBodega.[U_SO1_NOMBREALMACEN] AS nombreAlmacen
              FROM [dbo].[@SO1_01VENTADETALLE] AS detalleBodega
              LEFT JOIN [dbo].[@SO1_01SUCURSALALMA] AS almacenBodega
                ON almacenBodega.[U_SO1_CODIGOALMACEN] = detalleBodega.[U_SO1_ALMACEN]
              WHERE detalleBodega.[U_SO1_FOLIO] = venta.[Name]
                ${codigosAlmacen.length > 0
                  ? `AND detalleBodega.[U_SO1_ALMACEN] IN (${parametrosAlmacen.join(', ')})`
                  : ''}
            ) AS datosBodega
          ) AS bodegas
          WHERE ISNULL(venta.[U_SO1_VERIFICADO], 'N') <> 'Y'
            AND venta.[U_SO1_TIPO] = 'PE'
            AND venta.[U_SO1_STATUS] = 'A'
            AND NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(20), venta.[U_SO1_DOCUMENTOSBO]))), '') IS NOT NULL
            AND (@numeroPedido IS NULL OR venta.[U_SO1_DOCUMENTOSBO] = TRY_CONVERT(int, @numeroPedido))
            AND (@fechaDesde IS NULL OR venta.[U_SO1_FECHA] >= @fechaDesde)
            AND (@fechaHasta IS NULL OR venta.[U_SO1_FECHA] < DATEADD(day, 1, @fechaHasta))
            AND (@codigoEstadoVenta IS NULL OR venta.[U_SO1_STATUS] = @codigoEstadoVenta)
            AND (@codigoSincronizacion IS NULL OR venta.[U_SO1_SINCRONIZADO] = @codigoSincronizacion)
            ${condicionAlmacenes}
          ORDER BY
            CASE WHEN venta.[U_SO1_FECHA] IS NULL OR venta.[U_SO1_HORA] IS NULL THEN 1 ELSE 0 END,
            venta.[U_SO1_FECHA] ASC,
            venta.[U_SO1_HORA] ASC,
            venta.[Name] ASC
          OFFSET @desplazamiento ROWS
          FETCH NEXT @cantidadConsulta ROWS ONLY
          OPTION (RECOMPILE);
        `, (solicitud) => {
        solicitud
          .input('numeroPedido', sql.NVarChar(20), filtros.numeroPedido ?? null)
          .input('fechaDesde', sql.Date, filtros.fechaDesde ?? null)
          .input('fechaHasta', sql.Date, filtros.fechaHasta ?? null)
          .input('codigoEstadoVenta', sql.NVarChar(1), filtros.codigoEstadoVenta ?? null)
          .input('codigoSincronizacion', sql.Char(1), filtros.codigoSincronizacion ?? null)
          .input('desplazamiento', sql.Int, desplazamiento)
          .input('cantidadConsulta', sql.Int, cantidadConsulta);
        codigosAlmacen.forEach((codigoAlmacen, indice) => {
          solicitud.input(`codigoAlmacen${indice}`, sql.NVarChar(16), codigoAlmacen);
        });
        return solicitud;
      }, this.proveedorPool);

      const hayMas = resultado.recordset.length > filtros.cantidadPorPagina;
      const pedidos = resultado.recordset.slice(0, filtros.cantidadPorPagina)
        .map((fila) => mapearPedido(fila, this.codigoFuente));
      const totalRegistros = Number(resultado.recordset[0]?.totalRegistros ?? 0);

      if (pedidos.length > 0) {
        const parametrosFolio = pedidos.map((_, indice) => `@folioPedido${indice}`);
        const resultadoArticulos = await consultarSistemaOrigen<FilaArticuloResumen>(`
            SELECT
              detalle.[U_SO1_FOLIO] AS folioPedido,
              detalle.[U_SO1_NUMPARTIDA] AS numeroPartida,
              detalle.[U_SO1_NUMEROARTICULO] AS codigoArticulo,
              detalle.[U_SO1_DESCRIPCION] AS descripcion,
              detalle.[U_SO1_CANTIDAD] AS cantidad,
              detalle.[U_SO1_ALMACEN] AS codigoAlmacen,
              almacen.[U_SO1_NOMBREALMACEN] AS nombreAlmacen
            FROM [dbo].[@SO1_01VENTADETALLE] AS detalle
            LEFT JOIN [dbo].[@SO1_01SUCURSALALMA] AS almacen
              ON almacen.[U_SO1_CODIGOALMACEN] = detalle.[U_SO1_ALMACEN]
            WHERE detalle.[U_SO1_FOLIO] IN (${parametrosFolio.join(', ')})
              ${codigosAlmacen.length > 0
                ? `AND detalle.[U_SO1_ALMACEN] IN (${parametrosAlmacen.join(', ')})`
                : ''}
            ORDER BY detalle.[U_SO1_FOLIO], detalle.[U_SO1_NUMPARTIDA];
          `, (solicitud) => {
          pedidos.forEach((pedido, indice) => {
            solicitud.input(`folioPedido${indice}`, sql.NVarChar(100), pedido.folioPedido);
          });
          codigosAlmacen.forEach((codigoAlmacen, indice) => {
            solicitud.input(`codigoAlmacen${indice}`, sql.NVarChar(16), codigoAlmacen);
          });
          return solicitud;
        }, this.proveedorPool);

        for (const pedido of pedidos) {
          pedido.articulos = resultadoArticulos.recordset
            .filter((articulo) => articulo.folioPedido === pedido.folioPedido)
            .map((articulo) => ({
              identificadorDetalle: articulo.numeroPartida == null ? null : String(articulo.numeroPartida),
              codigoArticulo: normalizarTexto(articulo.codigoArticulo),
              descripcion: normalizarTexto(articulo.descripcion),
              cantidad: articulo.cantidad,
              codigoAlmacen: normalizarTexto(articulo.codigoAlmacen),
              nombreAlmacen: normalizarTexto(articulo.nombreAlmacen),
            }));
          pedido.codigosAlmacen = [...new Set(pedido.articulos
            .map((articulo) => articulo.codigoAlmacen)
            .filter((codigo): codigo is string => codigo !== null))];
          pedido.nombresBodega = [...new Set(pedido.articulos
            .map((articulo) => articulo.nombreAlmacen)
            .filter((nombre): nombre is string => nombre !== null))].join(', ') || null;
        }
      }

      return {
        pedidos,
        pagina: filtros.pagina,
        cantidadPorPagina: filtros.cantidadPorPagina,
        totalRegistros,
        hayMas,
      };
    } catch (error) {
      if (esErrorTemporalSql(error)) {
        throw new ErrorDependenciaDatos();
      }
      throw error;
    }
  }

  public async obtenerDetallePedido(
    folioPedido: string,
    codigosAlmacen: string[] = [],
  ): Promise<DetallePedido | null> {
    const parametrosAlmacen = codigosAlmacen.map((_, indice) => `@codigoAlmacen${indice}`);
    try {
      const resultadoCabecera = await consultarSistemaOrigen<FilaPedido>(`
          SELECT TOP (1)
            venta.[Name] AS folioPedido,
            COALESCE(CONVERT(nvarchar(20), venta.[U_SO1_DOCUMENTOSBO]), '') AS numeroPedido,
            venta.[Code] AS codigoVenta,
            venta.[U_SO1_VENDEDOR] AS codigoVendedor,
            vendedor.[SlpName] AS nombreVendedor,
            bodegas.[codigosAlmacen],
            bodegas.[nombresBodega],
            CASE
              WHEN venta.[U_SO1_FECHA] IS NULL OR venta.[U_SO1_HORA] IS NULL THEN NULL
              ELSE CONVERT(char(19), DATEADD(
                minute,
                (venta.[U_SO1_HORA] / 100) * 60 + (venta.[U_SO1_HORA] % 100),
                CONVERT(datetime2, CONVERT(date, venta.[U_SO1_FECHA]))
              ), 126)
            END AS fechaHoraPedido,
            venta.[U_SO1_STATUS] AS codigoEstadoVenta,
            venta.[U_SO1_SINCRONIZADO] AS codigoSincronizacion
          FROM [dbo].[@SO1_01VENTA] AS venta
          LEFT JOIN [dbo].[OSLP] AS vendedor
            ON vendedor.[SlpCode] = venta.[U_SO1_VENDEDOR]
          OUTER APPLY (
            SELECT
              STRING_AGG(datosBodega.[codigoAlmacen], ',')
                WITHIN GROUP (ORDER BY datosBodega.[codigoAlmacen]) AS codigosAlmacen,
              STRING_AGG(datosBodega.[nombreAlmacen], ', ')
                WITHIN GROUP (ORDER BY datosBodega.[codigoAlmacen]) AS nombresBodega
            FROM (
              SELECT DISTINCT
                detalleBodega.[U_SO1_ALMACEN] AS codigoAlmacen,
                almacenBodega.[U_SO1_NOMBREALMACEN] AS nombreAlmacen
              FROM [dbo].[@SO1_01VENTADETALLE] AS detalleBodega
              LEFT JOIN [dbo].[@SO1_01SUCURSALALMA] AS almacenBodega
                ON almacenBodega.[U_SO1_CODIGOALMACEN] = detalleBodega.[U_SO1_ALMACEN]
              WHERE detalleBodega.[U_SO1_FOLIO] = venta.[Name]
                ${codigosAlmacen.length > 0
                  ? `AND detalleBodega.[U_SO1_ALMACEN] IN (${parametrosAlmacen.join(', ')})`
                  : ''}
            ) AS datosBodega
          ) AS bodegas
          WHERE venta.[Name] = @folioPedido
            AND ISNULL(venta.[U_SO1_STATUS], '') <> 'C';
        `, (solicitud) => {
          solicitud.input('folioPedido', sql.NVarChar(100), folioPedido);
          codigosAlmacen.forEach((codigoAlmacen, indice) => {
            solicitud.input(`codigoAlmacen${indice}`, sql.NVarChar(16), codigoAlmacen);
          });
          return solicitud;
        },
        this.proveedorPool);

      const filaCabecera = resultadoCabecera.recordset[0];
      if (!filaCabecera) {
        return null;
      }

      const resultadoPartidas = await consultarSistemaOrigen<FilaPartida>(`
          SELECT TOP (1000)
            detalle.[U_SO1_NUMPARTIDA] AS numeroPartida,
            detalle.[U_SO1_NUMEROARTICULO] AS codigoArticulo,
            detalle.[U_SO1_DESCRIPCION] AS descripcionArticulo,
            detalle.[U_SO1_CANTIDAD] AS cantidadSolicitada,
            detalle.[U_SO1_ALMACEN] AS codigoAlmacen,
            almacen.[U_SO1_NOMBREALMACEN] AS nombreAlmacen,
            detalle.[U_SO1_STATUSENTREGA] AS codigoEstadoEntrega
          FROM [dbo].[@SO1_01VENTADETALLE] AS detalle
          LEFT JOIN [dbo].[@SO1_01SUCURSALALMA] AS almacen
            ON almacen.[U_SO1_CODIGOALMACEN] = detalle.[U_SO1_ALMACEN]
          WHERE detalle.[U_SO1_FOLIO] = @folioPedido
            ${codigosAlmacen.length > 0
              ? `AND detalle.[U_SO1_ALMACEN] IN (${parametrosAlmacen.join(', ')})`
              : ''}
          ORDER BY detalle.[U_SO1_NUMPARTIDA];
        `, (solicitud) => {
          solicitud.input('folioPedido', sql.NVarChar(100), folioPedido);
          codigosAlmacen.forEach((codigoAlmacen, indice) => {
            solicitud.input(`codigoAlmacen${indice}`, sql.NVarChar(16), codigoAlmacen);
          });
          return solicitud;
        },
        this.proveedorPool);

      if (codigosAlmacen.length > 0 && resultadoPartidas.recordset.length === 0) {
        return null;
      }

      return {
        cabecera: mapearPedido(filaCabecera, this.codigoFuente),
        partidas: resultadoPartidas.recordset.map(mapearPartida),
      };
    } catch (error) {
      if (esErrorTemporalSql(error)) {
        throw new ErrorDependenciaDatos();
      }
      throw error;
    }
  }
}
