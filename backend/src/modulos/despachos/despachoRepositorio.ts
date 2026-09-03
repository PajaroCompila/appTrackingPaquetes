import sql from 'mssql';
import { obtenerPoolPedidosBodega } from '../../infraestructura/sql/conexionPedidosBodega.js';
import type { PedidoResumen } from '../pedidos/pedido.interface.js';
import type { LineaDespachoValidada } from './lineaDespachoOrigenRepositorio.js';
import { fechaSqlSinZona } from '../../compartido/fechaSql.js';

export interface PedidoDespachado extends PedidoResumen {
  estadoLocal: 'DESPACHADO';
  despachadoEn: string;
  usuarioDespacho: string;
}

export interface ResultadoPersistenciaDespacho {
  transferidas: { idOrigen: string; identificadorDetalle: string }[];
}

export interface FiltrosDespachados {
  numeroPedido?: string;
  fechaDesde?: string;
  fechaHasta?: string;
  codigosAlmacen: string[];
  pagina: number;
  cantidadPorPagina: number;
}

export interface IDespachoRepositorio {
  identidadesLineas(): Promise<Set<string>>;
  guardarLineas(lineas: LineaDespachoValidada[], usuarioId: string): Promise<ResultadoPersistenciaDespacho>;
  listar(filtros: FiltrosDespachados): Promise<{ pedidos: PedidoDespachado[]; total: number }>;
  obtener(id: string): Promise<PedidoDespachado | null>;
}

export const claveLineaDespachada = (idOrigen: string, identificadorDetalle: string): string =>
  `${idOrigen}\u0000${identificadorDetalle}`;

export class DespachoRepositorio implements IDespachoRepositorio {
  public async identidadesLineas(): Promise<Set<string>> {
    const resultado = await obtenerPoolPedidosBodega().request().query<{
      idOrigen: string;
      identificadorDetalle: string;
    }>('SELECT idOrigen, identificadorDetalle FROM dbo.PedidoDespachadoDetalle;');
    const identidades = new Set<string>();
    for (const { idOrigen, identificadorDetalle } of resultado.recordset) {
      identidades.add(claveLineaDespachada(idOrigen, identificadorDetalle));
      if (identificadorDetalle.startsWith('LEGACY:')) {
        identidades.add(claveLineaDespachada(idOrigen, '*'));
      }
    }
    return identidades;
  }

  public async guardarLineas(
    lineas: LineaDespachoValidada[],
    usuarioId: string,
  ): Promise<ResultadoPersistenciaDespacho> {
    const transaccion = new sql.Transaction(obtenerPoolPedidosBodega());
    await transaccion.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    try {
      const agrupadas = new Map<string, LineaDespachoValidada[]>();
      for (const linea of lineas) {
        agrupadas.set(linea.idOrigen, [...(agrupadas.get(linea.idOrigen) ?? []), linea]);
      }
      for (const lineasPedido of agrupadas.values()) {
        const pedido = lineasPedido[0]!.pedido;
        const solicitudPedido = new sql.Request(transaccion)
          .input('idOrigen', sql.NVarChar(150), pedido.idOrigen)
          .input('origenPedido', sql.VarChar(3), pedido.origenPedido)
          .input('folioPedido', sql.NVarChar(100), pedido.folioPedido || null)
          .input('sapDocEntry', sql.NVarChar(50), pedido.sapDocEntry)
          .input('numeroPedido', sql.NVarChar(100), pedido.numeroPedido)
          .input('fechaHoraPedido', sql.DateTime2(3), pedido.fechaHoraPedido ? new Date(pedido.fechaHoraPedido) : null)
          .input('nombreVendedor', sql.NVarChar(200), pedido.nombreVendedor)
          .input('creadoEnR1', sql.Bit, pedido.creadoEnR1)
          .input('idUsuario', sql.UniqueIdentifier, usuarioId);
        const resultadoPedido = await solicitudPedido.query<{ idPedidoDespachado: number }>(`
          IF NOT EXISTS (SELECT 1 FROM dbo.PedidoDespachado WITH (UPDLOCK, HOLDLOCK)
            WHERE idOrigen = @idOrigen)
            INSERT dbo.PedidoDespachado(idOrigen, origenPedido, folioPedido, sapDocEntry,
              numeroPedido, fechaHoraPedido, nombreVendedor, creadoEnR1, estadoLocal, idUsuario)
            VALUES(@idOrigen, @origenPedido, @folioPedido, @sapDocEntry, @numeroPedido,
              @fechaHoraPedido, @nombreVendedor, @creadoEnR1, 'DESPACHADO', @idUsuario);
          SELECT idPedidoDespachado FROM dbo.PedidoDespachado WITH (UPDLOCK, HOLDLOCK)
            WHERE idOrigen = @idOrigen;
        `);
        const idPedidoDespachado = resultadoPedido.recordset[0]!.idPedidoDespachado;
        let numeroLinea = Number((await new sql.Request(transaccion)
          .input('idPedidoDespachado', sql.BigInt, idPedidoDespachado)
          .query<{ numeroLinea: number }>(`SELECT ISNULL(MAX(numeroLinea), 0) AS numeroLinea
            FROM dbo.PedidoDespachadoDetalle WITH (UPDLOCK, HOLDLOCK)
            WHERE idPedidoDespachado = @idPedidoDespachado;`)).recordset[0]!.numeroLinea);
        for (const linea of lineasPedido) {
          numeroLinea += 1;
          await new sql.Request(transaccion)
            .input('idPedidoDespachado', sql.BigInt, idPedidoDespachado)
            .input('numeroLinea', sql.Int, numeroLinea)
            .input('idOrigen', sql.NVarChar(150), linea.idOrigen)
            .input('identificadorDetalle', sql.NVarChar(150), linea.identificadorDetalle)
            .input('codigoArticulo', sql.NVarChar(100), linea.articulo.codigoArticulo)
            .input('descripcion', sql.NVarChar(500), linea.articulo.descripcion)
            .input('cantidad', sql.Decimal(19, 6), linea.articulo.cantidad)
            .input('codigoAlmacen', sql.NVarChar(16), linea.articulo.codigoAlmacen)
            .input('nombreAlmacen', sql.NVarChar(200), linea.articulo.nombreAlmacen)
            .input('idUsuario', sql.UniqueIdentifier, usuarioId)
            .query(`INSERT dbo.PedidoDespachadoDetalle(idPedidoDespachado, numeroLinea,
              idOrigen, identificadorDetalle, codigoArticulo, descripcion, cantidad,
              codigoAlmacen, nombreAlmacen, idUsuario, transferidoEn)
              VALUES(@idPedidoDespachado, @numeroLinea, @idOrigen, @identificadorDetalle,
              @codigoArticulo, @descripcion, @cantidad, @codigoAlmacen, @nombreAlmacen,
              @idUsuario, SYSUTCDATETIME());`);
        }
      }
      await transaccion.commit();
      return { transferidas: lineas.map(({ idOrigen, identificadorDetalle }) =>
        ({ idOrigen, identificadorDetalle })) };
    } catch (error) {
      await transaccion.rollback();
      throw error;
    }
  }

  private async consultar(
    idOrigen: string | null,
    filtros: FiltrosDespachados = { codigosAlmacen: [], pagina: 1, cantidadPorPagina: 25 },
  ): Promise<{ pedidos: PedidoDespachado[]; total: number }> {
    const parametrosAlmacen = filtros.codigosAlmacen.map((_, indice) => `@codigoAlmacen${indice}`);
    const solicitud = obtenerPoolPedidosBodega().request()
      .input('idOrigen', sql.NVarChar(150), idOrigen)
      .input('numeroPedido', sql.NVarChar(20), filtros.numeroPedido ?? null)
      .input('fechaDesde', sql.Date, filtros.fechaDesde ?? null)
      .input('fechaHasta', sql.Date, filtros.fechaHasta ?? null)
      .input('inicio', sql.Int, (filtros.pagina - 1) * filtros.cantidadPorPagina)
      .input('cantidad', sql.Int, filtros.cantidadPorPagina);
    filtros.codigosAlmacen.forEach((codigo, indice) =>
      solicitud.input(`codigoAlmacen${indice}`, sql.NVarChar(16), codigo));
    const filtroAlmacenes = parametrosAlmacen.length > 0 ? `AND EXISTS (
      SELECT 1 FROM dbo.PedidoDespachadoDetalle filtro
      WHERE filtro.idPedidoDespachado = pedido.idPedidoDespachado
        AND filtro.codigoAlmacen IN (${parametrosAlmacen.join(', ')}))` : '';
    const resultado = await solicitud.query(`WITH Pedidos AS (
        SELECT pedido.*, usuario.nombreVisible usuarioDespacho, COUNT(*) OVER() total
        FROM dbo.PedidoDespachado pedido
        JOIN dbo.UsuarioAplicacion usuario ON usuario.idUsuario = pedido.idUsuario
        WHERE pedido.estadoLocal = 'DESPACHADO' AND (@idOrigen IS NULL OR pedido.idOrigen = @idOrigen)
          AND (@numeroPedido IS NULL OR pedido.numeroPedido = @numeroPedido)
          AND (@fechaDesde IS NULL OR pedido.fechaHoraPedido >= @fechaDesde)
          AND (@fechaHasta IS NULL OR pedido.fechaHoraPedido < DATEADD(day, 1, @fechaHasta))
          ${filtroAlmacenes}
        ORDER BY CASE WHEN pedido.fechaHoraPedido IS NULL THEN 1 ELSE 0 END,
          pedido.fechaHoraPedido ASC, pedido.despachadoEn ASC, pedido.idPedidoDespachado ASC
        OFFSET @inicio ROWS FETCH NEXT @cantidad ROWS ONLY
      )
      SELECT pedido.*, detalle.identificadorDetalle, detalle.numeroLinea,
        detalle.codigoArticulo, detalle.descripcion, detalle.cantidad,
        detalle.codigoAlmacen detalleCodigoAlmacen,
        detalle.nombreAlmacen detalleNombreAlmacen,
        detalle.transferidoEn, usuarioDetalle.nombreVisible usuarioLinea
      FROM Pedidos pedido
      JOIN dbo.PedidoDespachadoDetalle detalle
        ON detalle.idPedidoDespachado = pedido.idPedidoDespachado
      JOIN dbo.UsuarioAplicacion usuarioDetalle ON usuarioDetalle.idUsuario = detalle.idUsuario
      ORDER BY CASE WHEN pedido.fechaHoraPedido IS NULL THEN 1 ELSE 0 END,
        pedido.fechaHoraPedido ASC, pedido.despachadoEn ASC, pedido.idPedidoDespachado ASC,
        TRY_CONVERT(bigint, detalle.identificadorDetalle),
        detalle.identificadorDetalle, detalle.numeroLinea;`);
    const mapa = new Map<string, PedidoDespachado>();
    for (const fila of resultado.recordset) {
      if (!mapa.has(fila.idOrigen)) {
        mapa.set(fila.idOrigen, {
          idOrigen: fila.idOrigen, origenPedido: fila.origenPedido, creadoEnR1: fila.creadoEnR1,
          sapDocEntry: fila.sapDocEntry, folioPedido: fila.folioPedido ?? '',
          numeroPedido: fila.numeroPedido, codigoVenta: null, codigoVendedor: null,
          nombreVendedor: fila.nombreVendedor, codigosAlmacen: [], nombresBodega: fila.nombreAlmacen,
          fechaHoraPedido: fechaSqlSinZona(fila.fechaHoraPedido),
          codigoEstadoVenta: 'DESPACHADO', codigoSincronizacion: null, articulos: [],
          estadoLocal: 'DESPACHADO', despachadoEn: fila.despachadoEn.toISOString(),
          usuarioDespacho: fila.usuarioDespacho,
        });
      }
      mapa.get(fila.idOrigen)!.articulos.push({
        identificadorDetalle: fila.identificadorDetalle,
        transferidoEn: fila.transferidoEn.toISOString(),
        usuarioTransferencia: fila.usuarioLinea,
        codigoArticulo: fila.codigoArticulo, descripcion: fila.descripcion,
        cantidad: Number(fila.cantidad), codigoAlmacen: fila.detalleCodigoAlmacen,
        nombreAlmacen: fila.detalleNombreAlmacen,
      });
    }
    return { pedidos: [...mapa.values()], total: Number(resultado.recordset[0]?.total ?? 0) };
  }

  public listar(filtros: FiltrosDespachados) { return this.consultar(null, filtros); }

  public async obtener(idOrigen: string): Promise<PedidoDespachado | null> {
    const pool = obtenerPoolPedidosBodega();
    const cabecera = (await pool.request()
      .input('idOrigen', sql.NVarChar(150), idOrigen)
      .query(`SELECT TOP (1) pedido.*, usuario.nombreVisible usuarioDespacho
        FROM dbo.PedidoDespachado pedido
        JOIN dbo.UsuarioAplicacion usuario ON usuario.idUsuario = pedido.idUsuario
        WHERE pedido.idOrigen = @idOrigen AND pedido.estadoLocal = 'DESPACHADO';`)).recordset[0];
    if (!cabecera) return null;

    const detalles = (await pool.request()
      .input('idPedidoDespachado', sql.BigInt, cabecera.idPedidoDespachado)
      .query(`SELECT detalle.identificadorDetalle, detalle.numeroLinea,
          detalle.codigoArticulo, detalle.descripcion, detalle.cantidad,
          detalle.codigoAlmacen, detalle.nombreAlmacen,
          detalle.transferidoEn, usuario.nombreVisible usuarioTransferencia
        FROM dbo.PedidoDespachadoDetalle detalle
        JOIN dbo.UsuarioAplicacion usuario ON usuario.idUsuario = detalle.idUsuario
        WHERE detalle.idPedidoDespachado = @idPedidoDespachado
        ORDER BY TRY_CONVERT(bigint, detalle.identificadorDetalle),
          detalle.identificadorDetalle, detalle.numeroLinea;`)).recordset;

    return {
      idOrigen: cabecera.idOrigen,
      origenPedido: cabecera.origenPedido,
      creadoEnR1: cabecera.creadoEnR1,
      sapDocEntry: cabecera.sapDocEntry,
      folioPedido: cabecera.folioPedido ?? '',
      numeroPedido: cabecera.numeroPedido,
      codigoVenta: null,
      codigoVendedor: null,
      nombreVendedor: cabecera.nombreVendedor,
      codigosAlmacen: [...new Set(detalles.map((detalle) => detalle.codigoAlmacen)
        .filter((codigo): codigo is string => Boolean(codigo)))],
      nombresBodega: null,
      fechaHoraPedido: fechaSqlSinZona(cabecera.fechaHoraPedido),
      codigoEstadoVenta: 'DESPACHADO',
      codigoSincronizacion: null,
      estadoLocal: 'DESPACHADO',
      despachadoEn: cabecera.despachadoEn.toISOString(),
      usuarioDespacho: cabecera.usuarioDespacho,
      articulos: detalles.map((detalle) => ({
        identificadorDetalle: detalle.identificadorDetalle,
        transferidoEn: detalle.transferidoEn.toISOString(),
        usuarioTransferencia: detalle.usuarioTransferencia,
        codigoArticulo: detalle.codigoArticulo,
        descripcion: detalle.descripcion,
        cantidad: Number(detalle.cantidad),
        codigoAlmacen: detalle.codigoAlmacen,
        nombreAlmacen: detalle.nombreAlmacen,
      })),
    };
  }
}
