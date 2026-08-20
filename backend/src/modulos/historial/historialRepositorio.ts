import sql from 'mssql';
import { obtenerPoolPedidosBodega } from '../../infraestructura/sql/conexionPedidosBodega.js';
import { obtenerPoolSistemaOrigen } from '../../infraestructura/sql/conexionSistemaOrigen.js';
import { consultarSistemaOrigen } from '../../infraestructura/sql/consultaSistemaOrigen.js';
import { consultarSap } from '../../infraestructura/sql/consultaSap.js';
import { obtenerPoolSucursalR1, obtenerSucursalesR1 } from '../../infraestructura/sql/conexionSucursalesR1.js';
import type { FiltrosHistorial, PaginaHistorial, PedidoHistorial } from './historial.interface.js';
import type { ConfiguracionSucursalR1 } from '../../configuracion/configuracionBaseDatos.js';
import { fechaSqlSinZona } from '../../compartido/fechaSql.js';

export interface CandidatoValidacion { idOrigen: string; folioPedido: string }
export interface CandidatoSap { idOrigen: string; sapDocEntry: string }
export interface EstadoR1Detectado {
  codigoSucursal: string | null;
  codigoEstadoVenta: string | null;
  verificado: boolean;
}

export class HistorialRepositorio {
  public constructor(
    private readonly proveedorSistemaOrigen: () => sql.ConnectionPool = obtenerPoolSistemaOrigen,
    private readonly proveedorPedidosBodega: () => sql.ConnectionPool = obtenerPoolPedidosBodega,
    private readonly sucursalesConfiguradas?: ConfiguracionSucursalR1[],
    private readonly proveedorSucursal: typeof obtenerPoolSucursalR1 = obtenerPoolSucursalR1,
  ) {}

  public async obtenerDespachadosPendientes(): Promise<CandidatoValidacion[]> {
    const resultado = await this.proveedorPedidosBodega().request().query<CandidatoValidacion>(`
      SELECT TOP (1000) idOrigen, folioPedido
      FROM dbo.PedidoDespachado
      WHERE estadoLocal IN ('DESPACHADO', 'CERRADO')
        AND origenPedido = 'R1'
        AND NULLIF(LTRIM(RTRIM(folioPedido)), '') IS NOT NULL
      ORDER BY despachadoEn, idPedidoDespachado;
    `);
    return resultado.recordset;
  }

  public async obtenerDespachadosSapPendientes(): Promise<CandidatoSap[]> {
    const resultado = await this.proveedorPedidosBodega().request().query<CandidatoSap>(`
      SELECT TOP (1000) idOrigen, sapDocEntry
      FROM dbo.PedidoDespachado
      WHERE estadoLocal = 'DESPACHADO'
        AND origenPedido = 'SAP'
        AND NULLIF(LTRIM(RTRIM(sapDocEntry)), '') IS NOT NULL
      ORDER BY despachadoEn, idPedidoDespachado;
    `);
    return resultado.recordset;
  }

  public async obtenerCerradosSap(candidatos: CandidatoSap[]): Promise<string[]> {
    if (candidatos.length === 0) return [];
    const unicos = [...new Map(candidatos.slice(0, 1000)
      .map((candidato) => [candidato.sapDocEntry, candidato])).values()];
    const parametros = unicos.map((_, indice) => `@docEntry${indice}`);
    const resultado = await consultarSap<{ docEntry: number }>(`
      SELECT pedido.[DocEntry] AS docEntry
      FROM [dbo].[ORDR] pedido
      WHERE pedido.[DocEntry] IN (${parametros.join(', ')})
        AND pedido.[DocStatus] = @estadoCerrado;
    `, (solicitud) => {
      solicitud.input('estadoCerrado', sql.Char(1), 'C');
      unicos.forEach(({ sapDocEntry }, indice) =>
        solicitud.input(`docEntry${indice}`, sql.Int, Number(sapDocEntry)));
      return solicitud;
    });
    const cerrados = new Set(resultado.recordset.map(({ docEntry }) => String(docEntry)));
    return unicos.filter(({ sapDocEntry }) => cerrados.has(sapDocEntry))
      .map(({ idOrigen }) => idOrigen);
  }

  public async obtenerEstadosR1(candidatos: CandidatoValidacion[]): Promise<Map<string, EstadoR1Detectado>> {
    if (candidatos.length === 0) return new Map();
    const sucursales = this.sucursalesConfiguradas ?? obtenerSucursalesR1();
    const grupos = new Map<string, CandidatoValidacion[]>();
    for (const candidato of candidatos.slice(0, 1000)) {
      const partes = candidato.idOrigen.split(':');
      const codigoFuente = partes.length >= 3 ? (partes[1] ?? 'TSPS01') : 'TSPS01';
      grupos.set(codigoFuente, [...(grupos.get(codigoFuente) ?? []), candidato]);
    }
    const resultados = await Promise.allSettled([...grupos.entries()].map(async ([codigoFuente, grupo]) => {
      const sucursal = sucursales.find((item) => item.codigoTienda === codigoFuente);
      if (!sucursal) return new Map<string, EstadoR1Detectado>();
      const pool = this.sucursalesConfiguradas
        ? await this.proveedorSucursal(sucursal)
        : codigoFuente === 'TSPS01' && grupos.size === 1
          ? this.proveedorSistemaOrigen()
          : await this.proveedorSucursal(sucursal);
      const unicos = [...new Set(grupo.map(({ folioPedido }) => folioPedido))];
      const parametros = unicos.map((_, indice) => `@folio${indice}`);
      const resultado = await consultarSistemaOrigen<{
        folioPedido: string;
        codigoSucursal: string | null;
        codigoEstadoVenta: string | null;
        verificado: string | null;
      }>(`
      SELECT venta.[Name] AS folioPedido,
        NULLIF(LTRIM(RTRIM(venta.[U_SO1_SUCURSAL])), '') AS codigoSucursal,
        NULLIF(LTRIM(RTRIM(venta.[U_SO1_STATUS])), '') AS codigoEstadoVenta,
        NULLIF(LTRIM(RTRIM(venta.[U_SO1_VERIFICADO])), '') AS verificado
      FROM [dbo].[@SO1_01VENTA] venta
      WHERE venta.[Name] IN (${parametros.join(', ')})
        AND (venta.[U_SO1_VERIFICADO] = 'Y' OR venta.[U_SO1_STATUS] = 'C');
      `, (solicitud) => {
        unicos.forEach((folio, indice) => solicitud.input(`folio${indice}`, sql.NVarChar(100), folio));
        return solicitud;
      }, () => pool);
      const estados = new Map(resultado.recordset.map((fila) => [fila.folioPedido, fila]));
      return new Map<string, EstadoR1Detectado>(grupo.flatMap(({ idOrigen, folioPedido }) => {
        const estado = estados.get(folioPedido);
        return estado ? [[idOrigen, {
          codigoSucursal: estado.codigoSucursal,
          codigoEstadoVenta: estado.codigoEstadoVenta?.trim() || null,
          verificado: estado.verificado?.trim() === 'Y',
        }] as const] : [];
      }));
    }));
    return new Map(resultados.flatMap((resultado) => resultado.status === 'fulfilled'
      ? [...resultado.value.entries()] : []));
  }

  public async marcarCerrados(idsOrigen: string[]): Promise<number> {
    if (idsOrigen.length === 0) return 0;
    const transaccion = new sql.Transaction(this.proveedorPedidosBodega());
    await transaccion.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    try {
      const solicitud = new sql.Request(transaccion);
      const unicos = [...new Set(idsOrigen)];
      const parametros = unicos.map((idOrigen, indice) => {
        solicitud.input(`cerrado${indice}`, sql.NVarChar(150), idOrigen);
        return `@cerrado${indice}`;
      });
      const resultado = await solicitud.query(`
        UPDATE dbo.PedidoDespachado WITH (UPDLOCK, HOLDLOCK)
        SET estadoLocal = 'CERRADO',
            cerradoDetectadoEn = COALESCE(cerradoDetectadoEn, SYSUTCDATETIME()),
            actualizadoEn = SYSUTCDATETIME()
        WHERE estadoLocal IN ('DESPACHADO', 'CERRADO')
          AND idOrigen IN (${parametros.join(', ')});
      `);
      await transaccion.commit();
      return resultado.rowsAffected[0] ?? 0;
    } catch (error) {
      await transaccion.rollback();
      throw error;
    }
  }

  public async marcarValidados(pedidos: { idOrigen: string; codigoSucursal: string | null }[]): Promise<number> {
    if (pedidos.length === 0) return 0;
    const transaccion = new sql.Transaction(this.proveedorPedidosBodega());
    await transaccion.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    try {
      const solicitud = new sql.Request(transaccion);
      const unicos = [...new Map(pedidos.map((pedido) => [pedido.idOrigen, pedido])).values()];
      const parametros = unicos.map(({ idOrigen, codigoSucursal }, indice) => {
        solicitud.input(`idOrigen${indice}`, sql.NVarChar(150), idOrigen);
        solicitud.input(`codigoSucursal${indice}`, sql.NVarChar(16), codigoSucursal);
        return `@idOrigen${indice}`;
      });
      const sucursales = unicos.map((_, indice) =>
        `WHEN @idOrigen${indice} THEN @codigoSucursal${indice}`).join(' ');
      const resultado = await solicitud.query(`
        UPDATE dbo.PedidoDespachado WITH (UPDLOCK, HOLDLOCK)
        SET estadoLocal = 'VALIDADO',
            validadoDetectadoEn = COALESCE(validadoDetectadoEn, SYSUTCDATETIME()),
            codigoSucursal = COALESCE(codigoSucursal, CASE idOrigen ${sucursales} END),
            actualizadoEn = SYSUTCDATETIME()
        WHERE estadoLocal = 'DESPACHADO'
          AND idOrigen IN (${parametros.join(', ')});
      `);
      await transaccion.commit();
      return resultado.rowsAffected[0] ?? 0;
    } catch (error) {
      await transaccion.rollback();
      throw error;
    }
  }

  public async buscarHistorial(filtros: FiltrosHistorial, idOrigen: string | null = null): Promise<PaginaHistorial> {
    const inicio = (filtros.pagina - 1) * filtros.cantidadPorPagina;
    const parametrosAlmacen = filtros.codigosAlmacen.map((_, indice) => `@codigoAlmacen${indice}`);
    const solicitud = this.proveedorPedidosBodega().request()
      .input('fechaDesde', sql.Date, filtros.fechaDesde)
      .input('fechaHasta', sql.Date, filtros.fechaHasta)
      .input('numeroPedido', sql.NVarChar(20), filtros.numeroPedido ?? null)
      .input('idOrigen', sql.NVarChar(150), idOrigen)
      .input('inicio', sql.Int, inicio)
      .input('cantidad', sql.Int, filtros.cantidadPorPagina);
    filtros.codigosAlmacen.forEach((codigo, indice) =>
      solicitud.input(`codigoAlmacen${indice}`, sql.NVarChar(16), codigo));
    const resultado = await solicitud.query(`WITH Pedidos AS (
        SELECT pedido.*, usuario.nombreVisible usuarioDespacho, COUNT(*) OVER() total
        FROM dbo.PedidoDespachado pedido
        JOIN dbo.UsuarioAplicacion usuario ON usuario.idUsuario = pedido.idUsuario
        WHERE pedido.origenPedido = 'SAP'
          AND pedido.creadoEnR1 = 0
          AND pedido.estadoLocal = 'VALIDADO'
          AND (@idOrigen IS NULL OR pedido.idOrigen = @idOrigen)
          AND pedido.despachadoEn >= @fechaDesde
          AND pedido.despachadoEn < DATEADD(day, 1, @fechaHasta)
          AND (@numeroPedido IS NULL OR pedido.numeroPedido LIKE CONCAT('%', @numeroPedido))
          ${parametrosAlmacen.length > 0 ? `AND EXISTS (
            SELECT 1 FROM dbo.PedidoDespachadoDetalle filtro
            WHERE filtro.idPedidoDespachado = pedido.idPedidoDespachado
              AND filtro.codigoAlmacen IN (${parametrosAlmacen.join(', ')}))` : ''}
        ORDER BY pedido.despachadoEn DESC, pedido.idPedidoDespachado DESC
        OFFSET @inicio ROWS FETCH NEXT @cantidad ROWS ONLY
      )
      SELECT pedido.*, detalle.identificadorDetalle, detalle.numeroLinea,
        detalle.codigoArticulo, detalle.descripcion, detalle.cantidad,
        detalle.codigoAlmacen detalleCodigoAlmacen, detalle.nombreAlmacen detalleNombreAlmacen,
        detalle.transferidoEn, usuarioDetalle.nombreVisible usuarioLinea
      FROM Pedidos pedido
      JOIN dbo.PedidoDespachadoDetalle detalle ON detalle.idPedidoDespachado = pedido.idPedidoDespachado
      JOIN dbo.UsuarioAplicacion usuarioDetalle ON usuarioDetalle.idUsuario = detalle.idUsuario
      ${parametrosAlmacen.length > 0
        ? `WHERE detalle.codigoAlmacen IN (${parametrosAlmacen.join(', ')})` : ''}
      ORDER BY pedido.despachadoEn DESC, pedido.idPedidoDespachado DESC,
        TRY_CONVERT(bigint, detalle.identificadorDetalle), detalle.identificadorDetalle, detalle.numeroLinea;
    `);
    const mapa = new Map<string, PedidoHistorial>();
    for (const fila of resultado.recordset) {
      if (!mapa.has(fila.idOrigen)) {
        mapa.set(fila.idOrigen, {
          idOrigen: fila.idOrigen, origenPedido: fila.origenPedido, creadoEnR1: fila.creadoEnR1,
          sapDocEntry: fila.sapDocEntry, folioPedido: fila.folioPedido ?? '', numeroPedido: fila.numeroPedido,
          codigoVenta: null, codigoVendedor: null, nombreVendedor: fila.nombreVendedor,
          codigosAlmacen: [], nombresBodega: null,
          fechaHoraPedido: fechaSqlSinZona(fila.fechaHoraPedido),
          codigoEstadoVenta: 'C', codigoSincronizacion: null, articulos: [],
          estadoLocal: 'VALIDADO', despachadoEn: fila.despachadoEn.toISOString(),
          validadoDetectadoEn: fila.validadoDetectadoEn?.toISOString() ?? null,
          usuarioDespacho: fila.usuarioDespacho,
        });
      }
      mapa.get(fila.idOrigen)!.articulos.push({
        identificadorDetalle: fila.identificadorDetalle,
        transferidoEn: fila.transferidoEn.toISOString(), usuarioTransferencia: fila.usuarioLinea,
        codigoArticulo: fila.codigoArticulo, descripcion: fila.descripcion, cantidad: Number(fila.cantidad),
        codigoAlmacen: fila.detalleCodigoAlmacen, nombreAlmacen: fila.detalleNombreAlmacen,
      });
      const pedido = mapa.get(fila.idOrigen)!;
      if (fila.detalleCodigoAlmacen && !pedido.codigosAlmacen.includes(fila.detalleCodigoAlmacen)) {
        pedido.codigosAlmacen.push(fila.detalleCodigoAlmacen);
      }
    }
    const total = Number(resultado.recordset[0]?.total ?? 0);
    return { registros: [...mapa.values()], pagina: filtros.pagina,
      cantidadPorPagina: filtros.cantidadPorPagina,
      hayMas: inicio + filtros.cantidadPorPagina < total };
  }

  public async obtenerHistorial(idOrigen: string): Promise<PedidoHistorial | null> {
    const hoy = new Date();
    const inicio = new Date(0).toISOString().slice(0, 10);
    const fin = hoy.toISOString().slice(0, 10);
    const resultado = await this.buscarHistorial({ fechaDesde: inicio, fechaHasta: fin,
      codigosAlmacen: [], pagina: 1, cantidadPorPagina: 1 }, idOrigen);
    return resultado.registros[0] ?? null;
  }
}
