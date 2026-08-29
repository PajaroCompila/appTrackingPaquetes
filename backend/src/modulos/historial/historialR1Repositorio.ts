import sql from 'mssql';
import type { ConfiguracionSucursalR1 } from '../../configuracion/configuracionBaseDatos.js';
import { obtenerPoolPedidosBodega } from '../../infraestructura/sql/conexionPedidosBodega.js';
import { obtenerPoolSucursalR1, obtenerSucursalesR1 } from '../../infraestructura/sql/conexionSucursalesR1.js';
import { validarConsultaSistemaOrigen } from '../../infraestructura/sql/consultaSistemaOrigen.js';
import type {
  ArticuloHistorial,
  FiltrosHistorial,
  PaginaArticulosHistorial,
  PaginaHistorial,
  PedidoHistorial,
} from './historial.interface.js';

interface CabeceraR1 {
  folioPedido: string; numeroPedido: string; codigoVenta: string | null;
  codigoVendedor: number | null; nombreVendedor: string | null; fechaHoraPedido: string | null;
  codigoEstadoVenta: string | null; codigoSincronizacion: string | null;
}
interface LineaR1 {
  folioPedido: string; numeroPartida: number | null; codigoArticulo: string | null;
  descripcion: string | null; cantidad: number | null; codigoAlmacen: string | null;
  nombreAlmacen: string | null;
}
interface MetaLocal {
  idOrigen: string; despachadoEn: Date; validadoDetectadoEn: Date | null; usuarioDespacho: string;
}
interface CabeceraFuente { sucursal: ConfiguracionSucursalR1; fila: CabeceraR1 }
interface ArticuloR1 extends Omit<ArticuloHistorial, 'idOrigen'> { folioPedido: string }

const texto = (valor: string | null): string | null => valor?.trim() || null;

export class HistorialR1Repositorio {
  public constructor(private readonly sucursales: ConfiguracionSucursalR1[] = obtenerSucursalesR1()) {}

  public async buscar(filtros: FiltrosHistorial): Promise<PaginaHistorial> {
    const cantidadAcumulada = filtros.pagina * filtros.cantidadPorPagina;
    const cantidadConsulta = cantidadAcumulada + 1;
    const resultados = await Promise.allSettled(this.sucursales.map(async (sucursal) => ({
      sucursal, filas: await this.consultarCabeceras(sucursal, filtros, cantidadConsulta),
    })));
    const disponibles = resultados.filter((resultado) => resultado.status === 'fulfilled');
    if (disponibles.length === 0) throw resultados[0]?.status === 'rejected'
      ? resultados[0].reason : new Error('No hay sucursales R1 disponibles.');
    const todas: CabeceraFuente[] = disponibles.flatMap(({ value }) =>
      value.filas.map((fila) => ({ sucursal: value.sucursal, fila })));
    todas.sort((a, b) => (b.fila.fechaHoraPedido ?? '').localeCompare(a.fila.fechaHoraPedido ?? '')
      || a.fila.folioPedido.localeCompare(b.fila.folioPedido));
    const inicio = (filtros.pagina - 1) * filtros.cantidadPorPagina;
    const pagina = todas.slice(inicio, inicio + filtros.cantidadPorPagina);
    const lineas = await this.obtenerLineasAgrupadas(pagina, filtros.codigosAlmacen);
    const metadatos = await this.obtenerMetadatosLocales(pagina.map(({ sucursal, fila }) =>
      `R1:${sucursal.codigoTienda}:${fila.folioPedido}`));
    const registros = pagina.map(({ sucursal, fila }) => this.mapearPedido(
      sucursal, fila, lineas.get(`${sucursal.codigoTienda}\u0000${fila.folioPedido}`) ?? [],
      metadatos.get(`R1:${sucursal.codigoTienda}:${fila.folioPedido}`),
    ));
    return { registros, pagina: filtros.pagina, cantidadPorPagina: filtros.cantidadPorPagina,
      hayMas: todas.length > inicio + filtros.cantidadPorPagina };
  }

  public async buscarArticulos(filtros: FiltrosHistorial): Promise<PaginaArticulosHistorial> {
    const cantidadAcumulada = filtros.pagina * filtros.cantidadPorPagina;
    const cantidadConsulta = cantidadAcumulada + 1;
    const resultados = await Promise.allSettled(this.sucursales.map(async (sucursal) => ({
      sucursal, filas: await this.consultarArticulos(sucursal, filtros, cantidadConsulta),
    })));
    const disponibles = resultados.filter((resultado) => resultado.status === 'fulfilled');
    if (disponibles.length === 0) throw resultados[0]?.status === 'rejected'
      ? resultados[0].reason : new Error('No hay sucursales R1 disponibles.');
    const todos = disponibles.flatMap(({ value }) => value.filas.map((fila) => ({
      ...fila, idOrigen: `R1:${value.sucursal.codigoTienda}:${fila.folioPedido}`,
    })));
    todos.sort((a, b) => (b.fechaHoraPedido ?? '').localeCompare(a.fechaHoraPedido ?? '')
      || a.numeroPedido.localeCompare(b.numeroPedido)
      || Number(a.identificadorDetalle ?? 0) - Number(b.identificadorDetalle ?? 0));
    const inicio = (filtros.pagina - 1) * filtros.cantidadPorPagina;
    return { registros: todos.slice(inicio, inicio + filtros.cantidadPorPagina),
      pagina: filtros.pagina, cantidadPorPagina: filtros.cantidadPorPagina,
      hayMas: todos.length > inicio + filtros.cantidadPorPagina };
  }

  public async obtener(idOrigen: string): Promise<PedidoHistorial | null> {
    const partes = idOrigen.split(':');
    const codigoFuente = partes.length >= 3 ? partes[1] : 'TSPS01';
    const folio = partes.length >= 3 ? partes.slice(2).join(':') : partes.slice(1).join(':');
    const sucursal = this.sucursales.find((item) => item.codigoTienda === codigoFuente);
    if (!sucursal || !folio) return null;
    const fila = await this.consultarCabeceraPorFolio(sucursal, folio);
    if (!fila) return null;
    const fuente = [{ sucursal, fila }];
    const lineas = await this.obtenerLineasAgrupadas(fuente);
    const metadatos = await this.obtenerMetadatosLocales([idOrigen]);
    return this.mapearPedido(sucursal, fila,
      lineas.get(`${sucursal.codigoTienda}\u0000${folio}`) ?? [], metadatos.get(idOrigen));
  }

  private async consultarArticulos(
    sucursal: ConfiguracionSucursalR1, filtros: FiltrosHistorial, cantidad: number,
  ): Promise<ArticuloR1[]> {
    const parametrosAlmacen = filtros.codigosAlmacen.map((_, indice) => `@codigoAlmacen${indice}`);
    const consulta = `SELECT venta.[Name] folioPedido,
      CONVERT(nvarchar(20), venta.[U_SO1_DOCUMENTOSBO]) numeroPedido,
      CONVERT(nvarchar(30), detalle.[U_SO1_NUMPARTIDA]) identificadorDetalle,
      detalle.[U_SO1_NUMEROARTICULO] codigoArticulo,
      detalle.[U_SO1_DESCRIPCION] descripcion,
      detalle.[U_SO1_CANTIDAD] cantidad,
      detalle.[U_SO1_ALMACEN] codigoAlmacen,
      almacen.[U_SO1_NOMBREALMACEN] nombreAlmacen,
      vendedor.[SlpName] nombreVendedor,
      CASE WHEN venta.[U_SO1_FECHA] IS NULL OR venta.[U_SO1_HORA] IS NULL THEN NULL ELSE
        CONVERT(char(19), DATEADD(minute, (venta.[U_SO1_HORA] / 100) * 60 +
        (venta.[U_SO1_HORA] % 100), CONVERT(datetime2, CONVERT(date, venta.[U_SO1_FECHA]))), 126)
      END fechaHoraPedido
      FROM [dbo].[@SO1_01VENTA] venta
      JOIN [dbo].[@SO1_01VENTADETALLE] detalle ON detalle.[U_SO1_FOLIO] = venta.[Name]
      LEFT JOIN [dbo].[OSLP] vendedor ON vendedor.[SlpCode] = venta.[U_SO1_VENDEDOR]
      OUTER APPLY (SELECT TOP (1) catalogo.[U_SO1_NOMBREALMACEN]
        FROM [dbo].[@SO1_01SUCURSALALMA] catalogo
        WHERE catalogo.[U_SO1_CODIGOALMACEN] = detalle.[U_SO1_ALMACEN]) almacen
      WHERE venta.[U_SO1_TIPO] = 'PE' AND venta.[U_SO1_VERIFICADO] = 'Y'
        AND venta.[U_SO1_DOCUMENTOSBO] IS NOT NULL
        AND venta.[U_SO1_DOCUMENTOSBO] <> 0
        AND venta.[U_SO1_FECHA] >= @fechaDesde
        AND venta.[U_SO1_FECHA] < DATEADD(day, 1, @fechaHasta)
        AND (@numeroPedido IS NULL
          OR CONVERT(nvarchar(20), venta.[U_SO1_DOCUMENTOSBO]) LIKE CONCAT('%', @numeroPedido))
        ${parametrosAlmacen.length > 0 ? `AND detalle.[U_SO1_ALMACEN] IN (${parametrosAlmacen.join(', ')})` : ''}
      ORDER BY venta.[U_SO1_FECHA] DESC, venta.[U_SO1_HORA] DESC, venta.[Name], detalle.[U_SO1_NUMPARTIDA]
      OFFSET 0 ROWS FETCH NEXT @cantidad ROWS ONLY OPTION (RECOMPILE);`;
    validarConsultaSistemaOrigen(consulta);
    const solicitud = (await obtenerPoolSucursalR1(sucursal)).request()
      .input('fechaDesde', sql.Date, filtros.fechaDesde).input('fechaHasta', sql.Date, filtros.fechaHasta)
      .input('numeroPedido', sql.NVarChar(20), filtros.numeroPedido ?? null).input('cantidad', sql.Int, cantidad);
    filtros.codigosAlmacen.forEach((codigo, indice) =>
      solicitud.input(`codigoAlmacen${indice}`, sql.NVarChar(16), codigo));
    return (await solicitud.query<ArticuloR1>(consulta)).recordset;
  }

  private async consultarCabeceras(
    sucursal: ConfiguracionSucursalR1, filtros: FiltrosHistorial, cantidad: number,
  ): Promise<CabeceraR1[]> {
    const parametrosAlmacen = filtros.codigosAlmacen.map((_, indice) => `@codigoAlmacen${indice}`);
    const consulta = `SELECT venta.[Name] folioPedido,
      CONVERT(nvarchar(20), venta.[U_SO1_DOCUMENTOSBO]) numeroPedido,
      venta.[Code] codigoVenta, venta.[U_SO1_VENDEDOR] codigoVendedor,
      vendedor.[SlpName] nombreVendedor,
      CASE WHEN venta.[U_SO1_FECHA] IS NULL OR venta.[U_SO1_HORA] IS NULL THEN NULL ELSE
        CONVERT(char(19), DATEADD(minute, (venta.[U_SO1_HORA] / 100) * 60 +
        (venta.[U_SO1_HORA] % 100), CONVERT(datetime2, CONVERT(date, venta.[U_SO1_FECHA]))), 126)
      END fechaHoraPedido,
      venta.[U_SO1_STATUS] codigoEstadoVenta, venta.[U_SO1_SINCRONIZADO] codigoSincronizacion
      FROM [dbo].[@SO1_01VENTA] venta
      LEFT JOIN [dbo].[OSLP] vendedor ON vendedor.[SlpCode] = venta.[U_SO1_VENDEDOR]
      WHERE venta.[U_SO1_TIPO] = 'PE' AND venta.[U_SO1_VERIFICADO] = 'Y'
        AND venta.[U_SO1_DOCUMENTOSBO] IS NOT NULL
        AND venta.[U_SO1_DOCUMENTOSBO] <> 0
        AND venta.[U_SO1_FECHA] >= @fechaDesde
        AND venta.[U_SO1_FECHA] < DATEADD(day, 1, @fechaHasta)
        AND (@numeroPedido IS NULL
          OR CONVERT(nvarchar(20), venta.[U_SO1_DOCUMENTOSBO]) LIKE CONCAT('%', @numeroPedido))
        ${parametrosAlmacen.length > 0 ? `AND EXISTS (SELECT 1 FROM [dbo].[@SO1_01VENTADETALLE] detalle
          WHERE detalle.[U_SO1_FOLIO] = venta.[Name]
            AND detalle.[U_SO1_ALMACEN] IN (${parametrosAlmacen.join(', ')}))` : ''}
      ORDER BY venta.[U_SO1_FECHA] DESC, venta.[Name] DESC
      OFFSET 0 ROWS FETCH NEXT @cantidad ROWS ONLY OPTION (RECOMPILE);`;
    validarConsultaSistemaOrigen(consulta);
    const pool = await obtenerPoolSucursalR1(sucursal);
    const solicitud = pool.request()
      .input('fechaDesde', sql.Date, filtros.fechaDesde).input('fechaHasta', sql.Date, filtros.fechaHasta)
      .input('numeroPedido', sql.NVarChar(20), filtros.numeroPedido ?? null)
      .input('cantidad', sql.Int, cantidad);
    filtros.codigosAlmacen.forEach((codigo, indice) =>
      solicitud.input(`codigoAlmacen${indice}`, sql.NVarChar(16), codigo));
    return (await solicitud.query<CabeceraR1>(consulta)).recordset;
  }

  private async consultarCabeceraPorFolio(sucursal: ConfiguracionSucursalR1, folio: string): Promise<CabeceraR1 | null> {
    const consulta = `SELECT TOP (1) venta.[Name] folioPedido,
      CONVERT(nvarchar(20), venta.[U_SO1_DOCUMENTOSBO]) numeroPedido,
      venta.[Code] codigoVenta, venta.[U_SO1_VENDEDOR] codigoVendedor,
      vendedor.[SlpName] nombreVendedor,
      CASE WHEN venta.[U_SO1_FECHA] IS NULL OR venta.[U_SO1_HORA] IS NULL THEN NULL ELSE
        CONVERT(char(19), DATEADD(minute, (venta.[U_SO1_HORA] / 100) * 60 +
        (venta.[U_SO1_HORA] % 100), CONVERT(datetime2, CONVERT(date, venta.[U_SO1_FECHA]))), 126)
      END fechaHoraPedido, venta.[U_SO1_STATUS] codigoEstadoVenta,
      venta.[U_SO1_SINCRONIZADO] codigoSincronizacion
      FROM [dbo].[@SO1_01VENTA] venta LEFT JOIN [dbo].[OSLP] vendedor
        ON vendedor.[SlpCode] = venta.[U_SO1_VENDEDOR]
      WHERE venta.[U_SO1_TIPO] = 'PE' AND venta.[U_SO1_VERIFICADO] = 'Y'
        AND venta.[Name] = @folio;`;
    validarConsultaSistemaOrigen(consulta);
    const pool = await obtenerPoolSucursalR1(sucursal);
    return (await pool.request().input('folio', sql.NVarChar(100), folio)
      .query<CabeceraR1>(consulta)).recordset[0] ?? null;
  }

  private async obtenerLineasAgrupadas(
    cabeceras: CabeceraFuente[], codigosAlmacen: string[] = [],
  ): Promise<Map<string, LineaR1[]>> {
    const grupos = new Map<string, CabeceraFuente[]>();
    for (const cabecera of cabeceras) grupos.set(cabecera.sucursal.codigoTienda,
      [...(grupos.get(cabecera.sucursal.codigoTienda) ?? []), cabecera]);
    const resultados = await Promise.all([...grupos.values()].map(async (grupo) => {
      const sucursal = grupo[0]!.sucursal;
      const parametros = grupo.map((_, indice) => `@folio${indice}`);
      const parametrosAlmacen = codigosAlmacen.map((_, indice) => `@codigoAlmacen${indice}`);
      const consulta = `SELECT detalle.[U_SO1_FOLIO] folioPedido,
        detalle.[U_SO1_NUMPARTIDA] numeroPartida, detalle.[U_SO1_NUMEROARTICULO] codigoArticulo,
        detalle.[U_SO1_DESCRIPCION] descripcion, detalle.[U_SO1_CANTIDAD] cantidad,
        detalle.[U_SO1_ALMACEN] codigoAlmacen, almacen.[U_SO1_NOMBREALMACEN] nombreAlmacen
        FROM [dbo].[@SO1_01VENTADETALLE] detalle
        OUTER APPLY (SELECT TOP (1) catalogo.[U_SO1_NOMBREALMACEN]
          FROM [dbo].[@SO1_01SUCURSALALMA] catalogo
          WHERE catalogo.[U_SO1_CODIGOALMACEN] = detalle.[U_SO1_ALMACEN]) almacen
        WHERE detalle.[U_SO1_FOLIO] IN (${parametros.join(', ')})
          ${parametrosAlmacen.length > 0
            ? `AND detalle.[U_SO1_ALMACEN] IN (${parametrosAlmacen.join(', ')})` : ''}
        ORDER BY detalle.[U_SO1_FOLIO], detalle.[U_SO1_NUMPARTIDA];`;
      validarConsultaSistemaOrigen(consulta);
      const pool = await obtenerPoolSucursalR1(sucursal);
      const solicitud = pool.request();
      codigosAlmacen.forEach((codigo, indice) =>
        solicitud.input(`codigoAlmacen${indice}`, sql.NVarChar(16), codigo));
      grupo.forEach(({ fila }, indice) => solicitud.input(`folio${indice}`, sql.NVarChar(100), fila.folioPedido));
      return { sucursal, filas: (await solicitud.query<LineaR1>(consulta)).recordset };
    }));
    const mapa = new Map<string, LineaR1[]>();
    for (const { sucursal, filas } of resultados) for (const fila of filas) {
      const clave = `${sucursal.codigoTienda}\u0000${fila.folioPedido}`;
      mapa.set(clave, [...(mapa.get(clave) ?? []), fila]);
    }
    return mapa;
  }

  private async obtenerMetadatosLocales(ids: string[]): Promise<Map<string, MetaLocal>> {
    if (ids.length === 0) return new Map();
    const alias = new Map<string, string>();
    for (const id of ids) {
      alias.set(id, id);
      if (id.startsWith('R1:TSPS01:')) alias.set(`R1:${id.slice('R1:TSPS01:'.length)}`, id);
    }
    const idsConsulta = [...alias.keys()];
    const parametros = idsConsulta.map((_, indice) => `@id${indice}`);
    const solicitud = obtenerPoolPedidosBodega().request();
    idsConsulta.forEach((id, indice) => solicitud.input(`id${indice}`, sql.NVarChar(150), id));
    const resultado = await solicitud.query<MetaLocal>(`SELECT pedido.idOrigen, pedido.despachadoEn,
      pedido.validadoDetectadoEn, usuario.nombreVisible usuarioDespacho
      FROM dbo.PedidoDespachado pedido JOIN dbo.UsuarioAplicacion usuario
        ON usuario.idUsuario = pedido.idUsuario
      WHERE pedido.idOrigen IN (${parametros.join(', ')});`);
    return new Map(resultado.recordset.map((fila) => [alias.get(fila.idOrigen) ?? fila.idOrigen, fila]));
  }

  private mapearPedido(
    sucursal: ConfiguracionSucursalR1, fila: CabeceraR1, lineas: LineaR1[], meta?: MetaLocal,
  ): PedidoHistorial {
    const idOrigen = `R1:${sucursal.codigoTienda}:${fila.folioPedido}`;
    const articulos = lineas.map((linea) => ({
      identificadorDetalle: linea.numeroPartida == null ? null : String(linea.numeroPartida),
      codigoArticulo: texto(linea.codigoArticulo), descripcion: texto(linea.descripcion),
      cantidad: linea.cantidad, codigoAlmacen: texto(linea.codigoAlmacen),
      nombreAlmacen: texto(linea.nombreAlmacen),
    }));
    const codigosAlmacen = [...new Set(articulos.map(({ codigoAlmacen }) => codigoAlmacen)
      .filter((codigo): codigo is string => Boolean(codigo)))];
    return { idOrigen, origenPedido: 'R1', creadoEnR1: true, sapDocEntry: null,
      folioPedido: fila.folioPedido, numeroPedido: String(fila.numeroPedido),
      codigoVenta: texto(fila.codigoVenta), codigoVendedor: fila.codigoVendedor,
      nombreVendedor: texto(fila.nombreVendedor), codigosAlmacen,
      nombresBodega: [...new Set(articulos.map(({ nombreAlmacen }) => nombreAlmacen)
        .filter((nombre): nombre is string => Boolean(nombre)))].join(', ') || null,
      fechaHoraPedido: fila.fechaHoraPedido, codigoEstadoVenta: texto(fila.codigoEstadoVenta),
      codigoSincronizacion: texto(fila.codigoSincronizacion), articulos, estadoLocal: 'VALIDADO',
      despachadoEn: meta?.despachadoEn.toISOString() ?? null,
      validadoDetectadoEn: meta?.validadoDetectadoEn?.toISOString() ?? null,
      usuarioDespacho: meta?.usuarioDespacho ?? null };
  }
}
