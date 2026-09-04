import sql from 'mssql';
import { obtenerPoolPedidosBodega } from '../../infraestructura/sql/conexionPedidosBodega.js';
import { obtenerPoolSistemaOrigen } from '../../infraestructura/sql/conexionSistemaOrigen.js';
import { consultarSistemaOrigen } from '../../infraestructura/sql/consultaSistemaOrigen.js';
import { consultarSap } from '../../infraestructura/sql/consultaSap.js';
import { obtenerPoolSucursalR1, obtenerSucursalesR1 } from '../../infraestructura/sql/conexionSucursalesR1.js';
import type {
  ArticuloHistorial,
  FiltrosHistorial,
  PaginaArticulosHistorial,
  PaginaHistorial,
  PedidoHistorial,
} from './historial.interface.js';
import type { ConfiguracionSucursalR1 } from '../../configuracion/configuracionBaseDatos.js';
import { fechaSqlSinZona, fechaTextoSinZonaParaSql } from '../../compartido/fechaSql.js';

export interface CandidatoValidacion { idOrigen: string; folioPedido: string }
export interface CandidatoSap { idOrigen: string; sapDocEntry: string }
export interface EstadoR1Detectado {
  codigoSucursal: string | null;
  codigoEstadoVenta: string | null;
  verificado: boolean;
}
interface FilaCerradaSap {
  docEntry: number;
  docNum: number;
  fechaHoraPedido: string | null;
  nombreVendedor: string | null;
  numeroLinea: number | null;
  codigoArticulo: string | null;
  descripcion: string | null;
  cantidad: number | null;
  codigoAlmacen: string | null;
  nombreAlmacen: string | null;
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

  public async conservarCerradosSapSinDespacho(): Promise<number> {
    const poolLocal = this.proveedorPedidosBodega();
    const control = (await poolLocal.request().query<{ ultimaConsultaEn: Date | null }>(`
      SELECT ultimaConsultaEn FROM dbo.ControlSincronizacionSap
      WHERE clave = 'HISTORIAL_CERRADOS';
    `)).recordset[0];
    const margenMs = 2 * 24 * 60 * 60 * 1000;
    const primeraCargaMs = 366 * 24 * 60 * 60 * 1000;
    const fechaDesde = new Date(control?.ultimaConsultaEn
      ? control.ultimaConsultaEn.getTime() - margenMs
      : Date.now() - primeraCargaMs).toISOString().slice(0, 10);
    const resultado = await consultarSap<FilaCerradaSap>(`
      SELECT pedido.[DocEntry] AS docEntry, pedido.[DocNum] AS docNum,
        CONVERT(char(19), DATEADD(minute,
          (pedido.[DocTime] / 100) * 60 + (pedido.[DocTime] % 100),
          CONVERT(datetime2, CONVERT(date, pedido.[DocDate]))), 126) AS fechaHoraPedido,
        vendedor.[SlpName] AS nombreVendedor,
        detalle.[LineNum] AS numeroLinea, detalle.[ItemCode] AS codigoArticulo,
        detalle.[Dscription] AS descripcion, detalle.[Quantity] AS cantidad,
        detalle.[WhsCode] AS codigoAlmacen, almacen.[WhsName] AS nombreAlmacen
      FROM dbo.[ORDR] pedido
      INNER JOIN dbo.[OCRD] cliente ON cliente.[CardCode] = pedido.[CardCode]
      LEFT JOIN dbo.[OSLP] vendedor ON vendedor.[SlpCode] = pedido.[SlpCode]
      LEFT JOIN dbo.[RDR1] detalle ON detalle.[DocEntry] = pedido.[DocEntry]
      LEFT JOIN dbo.[OWHS] almacen ON almacen.[WhsCode] = detalle.[WhsCode]
      WHERE pedido.[U_SO1_01RETAILONE] = @creadoRetailOne
        AND cliente.[GroupCode] IN (@grupoMayoristaA, @grupoMayoristaB)
        AND pedido.[CANCELED] = @noCancelado
        AND pedido.[DocStatus] = @estadoCerrado
        AND (pedido.[UpdateDate] >= @fechaDesde OR pedido.[DocDate] >= @fechaDesde)
      ORDER BY pedido.[DocEntry], detalle.[LineNum];
    `, (solicitud) => solicitud
      .input('creadoRetailOne', sql.Char(1), 'N')
      .input('grupoMayoristaA', sql.Int, 103)
      .input('grupoMayoristaB', sql.Int, 113)
      .input('noCancelado', sql.Char(1), 'N')
      .input('estadoCerrado', sql.Char(1), 'C')
      .input('fechaDesde', sql.Date, fechaDesde));

    const existentes = await poolLocal.request().query<{ sapDocEntry: string }>(`
      SELECT CONVERT(nvarchar(50), sapDocEntry) AS sapDocEntry
      FROM dbo.PedidoDespachado
      WHERE origenPedido = 'SAP' AND sapDocEntry IS NOT NULL
      UNION
      SELECT CONVERT(nvarchar(50), sapDocEntry)
      FROM dbo.PedidoSapHistorial;
    `);
    const yaGuardados = new Set(existentes.recordset.map(({ sapDocEntry }) => sapDocEntry));
    const grupos = new Map<number, FilaCerradaSap[]>();
    for (const fila of resultado.recordset) {
      if (!yaGuardados.has(String(fila.docEntry))) {
        grupos.set(fila.docEntry, [...(grupos.get(fila.docEntry) ?? []), fila]);
      }
    }

    const transaccion = new sql.Transaction(poolLocal);
    await transaccion.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    let guardados = 0;
    try {
      for (const filas of grupos.values()) {
        const cabecera = filas[0]!;
        const insertado = await new sql.Request(transaccion)
          .input('sapDocEntry', sql.Int, cabecera.docEntry)
          .input('numeroPedido', sql.NVarChar(100), String(cabecera.docNum))
          .input('fechaHoraPedido', sql.DateTime2(3), fechaTextoSinZonaParaSql(cabecera.fechaHoraPedido))
          .input('nombreVendedor', sql.NVarChar(200), cabecera.nombreVendedor?.trim() || null)
          .query<{ idPedidoSapHistorial: number }>(`
            IF NOT EXISTS (SELECT 1 FROM dbo.PedidoSapHistorial WITH (UPDLOCK, HOLDLOCK)
              WHERE sapDocEntry = @sapDocEntry)
              AND NOT EXISTS (SELECT 1 FROM dbo.PedidoDespachado WITH (UPDLOCK, HOLDLOCK)
                WHERE origenPedido = 'SAP'
                  AND TRY_CONVERT(int, sapDocEntry) = @sapDocEntry)
              INSERT dbo.PedidoSapHistorial(sapDocEntry, numeroPedido, fechaHoraPedido, nombreVendedor)
                OUTPUT inserted.idPedidoSapHistorial
                VALUES(@sapDocEntry, @numeroPedido, @fechaHoraPedido, @nombreVendedor);
          `);
        const idPedido = insertado.recordset[0]?.idPedidoSapHistorial;
        if (!idPedido) continue;
        guardados += 1;
        for (const fila of filas) {
          if (fila.numeroLinea === null) continue;
          await new sql.Request(transaccion)
            .input('idPedido', sql.BigInt, idPedido)
            .input('numeroLinea', sql.Int, fila.numeroLinea)
            .input('codigoArticulo', sql.NVarChar(100), fila.codigoArticulo?.trim() || null)
            .input('descripcion', sql.NVarChar(500), fila.descripcion?.trim() || null)
            .input('cantidad', sql.Decimal(19, 6), fila.cantidad)
            .input('codigoAlmacen', sql.NVarChar(16), fila.codigoAlmacen?.trim() || null)
            .input('nombreAlmacen', sql.NVarChar(200), fila.nombreAlmacen?.trim() || null)
            .query(`INSERT dbo.PedidoSapHistorialDetalle(idPedidoSapHistorial, numeroLinea,
              codigoArticulo, descripcion, cantidad, codigoAlmacen, nombreAlmacen)
              VALUES(@idPedido, @numeroLinea, @codigoArticulo, @descripcion,
                @cantidad, @codigoAlmacen, @nombreAlmacen);`);
        }
      }
      await new sql.Request(transaccion).query(`UPDATE dbo.ControlSincronizacionSap
        SET ultimaConsultaEn = SYSUTCDATETIME() WHERE clave = 'HISTORIAL_CERRADOS';`);
      await transaccion.commit();
      return guardados;
    } catch (error) {
      await transaccion.rollback();
      throw error;
    }
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
    const resultado = await solicitud.query(`WITH Cabeceras AS (
        SELECT pedido.idOrigen, pedido.origenPedido, pedido.creadoEnR1, pedido.sapDocEntry,
          pedido.folioPedido, pedido.numeroPedido, pedido.nombreVendedor, pedido.fechaHoraPedido,
          pedido.despachadoEn, pedido.validadoDetectadoEn, usuario.nombreVisible usuarioDespacho,
          pedido.idPedidoDespachado, CONVERT(bigint, NULL) idPedidoSapHistorial
        FROM dbo.PedidoDespachado pedido
        JOIN dbo.UsuarioAplicacion usuario ON usuario.idUsuario = pedido.idUsuario
        WHERE pedido.origenPedido = 'SAP' AND pedido.creadoEnR1 = 0
          AND pedido.estadoLocal = 'VALIDADO'
          AND (@idOrigen IS NULL OR pedido.idOrigen = @idOrigen)
          AND COALESCE(pedido.fechaHoraPedido, pedido.despachadoEn) >= @fechaDesde
          AND COALESCE(pedido.fechaHoraPedido, pedido.despachadoEn) < DATEADD(day, 1, @fechaHasta)
          AND (@numeroPedido IS NULL OR pedido.numeroPedido LIKE CONCAT('%', @numeroPedido, '%'))
          ${parametrosAlmacen.length > 0 ? `AND EXISTS (SELECT 1
            FROM dbo.PedidoDespachadoDetalle filtro
            WHERE filtro.idPedidoDespachado = pedido.idPedidoDespachado
              AND filtro.codigoAlmacen IN (${parametrosAlmacen.join(', ')}))` : ''}
        UNION ALL
        SELECT CONCAT('SAP:', pedido.sapDocEntry), 'SAP', CONVERT(bit, 0),
          CONVERT(nvarchar(50), pedido.sapDocEntry), CONCAT('SAP:', pedido.sapDocEntry),
          pedido.numeroPedido, pedido.nombreVendedor, pedido.fechaHoraPedido,
          CONVERT(datetime2(3), NULL), pedido.cerradoDetectadoEn, CONVERT(nvarchar(200), NULL),
          CONVERT(bigint, NULL), pedido.idPedidoSapHistorial
        FROM dbo.PedidoSapHistorial pedido
        WHERE (@idOrigen IS NULL OR CONCAT('SAP:', pedido.sapDocEntry) = @idOrigen)
          AND pedido.fechaHoraPedido >= @fechaDesde
          AND pedido.fechaHoraPedido < DATEADD(day, 1, @fechaHasta)
          AND (@numeroPedido IS NULL OR pedido.numeroPedido LIKE CONCAT('%', @numeroPedido, '%'))
          ${parametrosAlmacen.length > 0 ? `AND EXISTS (SELECT 1
            FROM dbo.PedidoSapHistorialDetalle filtro
            WHERE filtro.idPedidoSapHistorial = pedido.idPedidoSapHistorial
              AND filtro.codigoAlmacen IN (${parametrosAlmacen.join(', ')}))` : ''}
      ), Pedidos AS (
        SELECT *, COUNT(*) OVER() total FROM Cabeceras
        ORDER BY fechaHoraPedido DESC, idOrigen DESC
        OFFSET @inicio ROWS FETCH NEXT @cantidad ROWS ONLY
      )
      SELECT pedido.*, detalle.identificadorDetalle, detalle.numeroLinea,
        detalle.codigoArticulo, detalle.descripcion, detalle.cantidad,
        detalle.codigoAlmacen detalleCodigoAlmacen, detalle.nombreAlmacen detalleNombreAlmacen,
        detalle.transferidoEn, detalle.usuarioLinea
      FROM Pedidos pedido
      CROSS APPLY (
        SELECT local.identificadorDetalle, local.numeroLinea, local.codigoArticulo,
          local.descripcion, local.cantidad, local.codigoAlmacen, local.nombreAlmacen,
          local.transferidoEn, usuarioDetalle.nombreVisible usuarioLinea
        FROM dbo.PedidoDespachadoDetalle local
        JOIN dbo.UsuarioAplicacion usuarioDetalle ON usuarioDetalle.idUsuario = local.idUsuario
        WHERE local.idPedidoDespachado = pedido.idPedidoDespachado
        UNION ALL
        SELECT CONVERT(nvarchar(150), sap.numeroLinea), sap.numeroLinea, sap.codigoArticulo,
          sap.descripcion, sap.cantidad, sap.codigoAlmacen, sap.nombreAlmacen,
          CONVERT(datetime2(3), NULL), CONVERT(nvarchar(200), NULL)
        FROM dbo.PedidoSapHistorialDetalle sap
        WHERE sap.idPedidoSapHistorial = pedido.idPedidoSapHistorial
      ) detalle
      ${parametrosAlmacen.length > 0
        ? `WHERE detalle.codigoAlmacen IN (${parametrosAlmacen.join(', ')})` : ''}
      ORDER BY pedido.fechaHoraPedido DESC, pedido.idOrigen DESC,
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
          estadoLocal: 'VALIDADO', despachadoEn: fila.despachadoEn?.toISOString() ?? null,
          validadoDetectadoEn: fila.validadoDetectadoEn?.toISOString() ?? null,
          usuarioDespacho: fila.usuarioDespacho,
        });
      }
      mapa.get(fila.idOrigen)!.articulos.push({
        identificadorDetalle: fila.identificadorDetalle,
        transferidoEn: fila.transferidoEn?.toISOString() ?? null, usuarioTransferencia: fila.usuarioLinea,
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

  public async buscarArticulosHistorial(filtros: FiltrosHistorial): Promise<PaginaArticulosHistorial> {
    const inicio = (filtros.pagina - 1) * filtros.cantidadPorPagina;
    const parametrosAlmacen = filtros.codigosAlmacen.map((_, indice) => `@codigoAlmacen${indice}`);
    const solicitud = this.proveedorPedidosBodega().request()
      .input('fechaDesde', sql.Date, filtros.fechaDesde)
      .input('fechaHasta', sql.Date, filtros.fechaHasta)
      .input('numeroPedido', sql.NVarChar(20), filtros.numeroPedido ?? null)
      .input('inicio', sql.Int, inicio)
      .input('cantidad', sql.Int, filtros.cantidadPorPagina);
    filtros.codigosAlmacen.forEach((codigo, indice) =>
      solicitud.input(`codigoAlmacen${indice}`, sql.NVarChar(16), codigo));
    const resultado = await solicitud.query(`WITH Articulos AS (
      SELECT pedido.idOrigen, detalle.identificadorDetalle, pedido.numeroPedido,
        detalle.codigoArticulo, detalle.descripcion, detalle.cantidad,
        detalle.codigoAlmacen, detalle.nombreAlmacen,
        pedido.fechaHoraPedido, pedido.nombreVendedor
      FROM dbo.PedidoDespachado pedido
      JOIN dbo.PedidoDespachadoDetalle detalle
        ON detalle.idPedidoDespachado = pedido.idPedidoDespachado
      WHERE pedido.origenPedido = 'SAP' AND pedido.creadoEnR1 = 0
        AND pedido.estadoLocal = 'VALIDADO'
        AND COALESCE(pedido.fechaHoraPedido, pedido.despachadoEn) >= @fechaDesde
        AND COALESCE(pedido.fechaHoraPedido, pedido.despachadoEn) < DATEADD(day, 1, @fechaHasta)
        AND (@numeroPedido IS NULL OR pedido.numeroPedido LIKE CONCAT('%', @numeroPedido, '%'))
        ${parametrosAlmacen.length > 0
          ? `AND detalle.codigoAlmacen IN (${parametrosAlmacen.join(', ')})` : ''}
      UNION ALL
      SELECT CONCAT('SAP:', pedido.sapDocEntry), CONVERT(nvarchar(150), detalle.numeroLinea),
        pedido.numeroPedido, detalle.codigoArticulo, detalle.descripcion, detalle.cantidad,
        detalle.codigoAlmacen, detalle.nombreAlmacen,
        pedido.fechaHoraPedido, pedido.nombreVendedor
      FROM dbo.PedidoSapHistorial pedido
      JOIN dbo.PedidoSapHistorialDetalle detalle
        ON detalle.idPedidoSapHistorial = pedido.idPedidoSapHistorial
      WHERE pedido.fechaHoraPedido >= @fechaDesde
        AND pedido.fechaHoraPedido < DATEADD(day, 1, @fechaHasta)
        AND (@numeroPedido IS NULL OR pedido.numeroPedido LIKE CONCAT('%', @numeroPedido, '%'))
        ${parametrosAlmacen.length > 0
          ? `AND detalle.codigoAlmacen IN (${parametrosAlmacen.join(', ')})` : ''}
    ), Pagina AS (
      SELECT *, COUNT(*) OVER() total FROM Articulos
      ORDER BY fechaHoraPedido DESC, idOrigen DESC,
        TRY_CONVERT(bigint, identificadorDetalle), identificadorDetalle
      OFFSET @inicio ROWS FETCH NEXT @cantidad ROWS ONLY
    ) SELECT * FROM Pagina
      ORDER BY fechaHoraPedido DESC, idOrigen DESC,
        TRY_CONVERT(bigint, identificadorDetalle), identificadorDetalle;`);
    const registros: ArticuloHistorial[] = resultado.recordset.map((fila) => ({
      idOrigen: fila.idOrigen,
      identificadorDetalle: fila.identificadorDetalle,
      numeroPedido: fila.numeroPedido,
      codigoArticulo: fila.codigoArticulo,
      descripcion: fila.descripcion,
      cantidad: fila.cantidad === null ? null : Number(fila.cantidad),
      codigoAlmacen: fila.codigoAlmacen,
      nombreAlmacen: fila.nombreAlmacen,
      fechaHoraPedido: fechaSqlSinZona(fila.fechaHoraPedido),
      nombreVendedor: fila.nombreVendedor,
    }));
    const total = Number(resultado.recordset[0]?.total ?? 0);
    return { registros, pagina: filtros.pagina, cantidadPorPagina: filtros.cantidadPorPagina,
      hayMas: inicio + registros.length < total };
  }

  public async obtenerHistorial(idOrigen: string): Promise<PedidoHistorial | null> {
    const resultado = await this.buscarHistorial({ fechaDesde: '1900-01-01', fechaHasta: '9999-12-30',
      codigosAlmacen: [], pagina: 1, cantidadPorPagina: 1 }, idOrigen);
    return resultado.registros[0] ?? null;
  }
}
