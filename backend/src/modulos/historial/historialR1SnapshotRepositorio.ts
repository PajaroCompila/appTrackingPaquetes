import sql from 'mssql';
import { obtenerPoolPedidosBodega } from '../../infraestructura/sql/conexionPedidosBodega.js';
import type {
  ArticuloHistorial,
  FiltrosHistorial,
  PaginaArticulosHistorial,
  PaginaHistorial,
  PedidoHistorial,
} from './historial.interface.js';
import { MIGRACION_HISTORIAL_R1_SNAPSHOT } from './historialR1SnapshotMigracion.js';

interface FilaSnapshot {
  datos: string;
  sincronizadoEn: Date;
  indiceArticulo?: number;
  total?: number;
}

let migracionEnCurso: Promise<void> | null = null;

async function asegurarEsquema(): Promise<void> {
  migracionEnCurso ??= obtenerPoolPedidosBodega().request()
    .query(MIGRACION_HISTORIAL_R1_SNAPSHOT).then(() => undefined)
    .catch((error) => {
      migracionEnCurso = null;
      throw error;
    });
  return migracionEnCurso;
}

function filtrarArticulos(pedido: PedidoHistorial, almacenes: string[]): PedidoHistorial {
  if (almacenes.length === 0) return pedido;
  const articulos = pedido.articulos.filter(({ codigoAlmacen }) =>
    codigoAlmacen !== null && almacenes.includes(codigoAlmacen));
  return {
    ...pedido,
    articulos,
    codigosAlmacen: [...new Set(articulos.flatMap(({ codigoAlmacen }) => codigoAlmacen ? [codigoAlmacen] : []))],
    nombresBodega: [...new Set(articulos.flatMap(({ nombreAlmacen }) => nombreAlmacen ? [nombreAlmacen] : []))]
      .join(', ') || null,
  };
}

export class HistorialR1SnapshotRepositorio {
  public async guardarRango(
    fechaDesde: string,
    fechaHasta: string,
    registros: PedidoHistorial[],
    completo: boolean,
  ): Promise<void> {
    await asegurarEsquema();
    await obtenerPoolPedidosBodega().request()
      .input('fechaDesde', sql.Date, fechaDesde)
      .input('fechaHasta', sql.Date, fechaHasta)
      .input('completo', sql.Bit, completo)
      .input('registros', sql.NVarChar(sql.MAX), JSON.stringify(registros))
      .query(`
        SET XACT_ABORT ON;
        BEGIN TRANSACTION;
        BEGIN TRY
          DECLARE @snapshot TABLE(
            idOrigen nvarchar(150) PRIMARY KEY,
            codigoSucursal nvarchar(16),
            folioPedido nvarchar(100),
            numeroPedido nvarchar(100),
            fechaHoraPedido datetime2(3),
            nombreVendedor nvarchar(200),
            esEspecial bit,
            datos nvarchar(max)
          );
          INSERT @snapshot
          SELECT idOrigen,
            CASE WHEN CHARINDEX(':', idOrigen, 4)>0
              THEN SUBSTRING(idOrigen,4,CHARINDEX(':',idOrigen,4)-4) ELSE '' END,
            folioPedido, numeroPedido, fechaHoraPedido, nombreVendedor,
            ISNULL(esEspecial,0), value
          FROM OPENJSON(@registros) WITH(
            idOrigen nvarchar(150) '$.idOrigen',
            folioPedido nvarchar(100) '$.folioPedido',
            numeroPedido nvarchar(100) '$.numeroPedido',
            fechaHoraPedido datetime2(3) '$.fechaHoraPedido',
            nombreVendedor nvarchar(200) '$.nombreVendedor',
            esEspecial bit '$.esEspecial',
            value nvarchar(max) '$' AS JSON
          );

          MERGE dbo.HistorialR1Snapshot WITH(HOLDLOCK) AS destino
          USING @snapshot AS origen ON origen.idOrigen=destino.idOrigen
          WHEN MATCHED THEN UPDATE SET
            codigoSucursal=origen.codigoSucursal, folioPedido=origen.folioPedido,
            numeroPedido=origen.numeroPedido, fechaHoraPedido=origen.fechaHoraPedido,
            nombreVendedor=origen.nombreVendedor, esEspecial=origen.esEspecial,
            datos=origen.datos, activo=1, sincronizadoEn=SYSUTCDATETIME()
          WHEN NOT MATCHED THEN INSERT(
            idOrigen,codigoSucursal,folioPedido,numeroPedido,fechaHoraPedido,
            nombreVendedor,esEspecial,datos,activo
          ) VALUES(
            origen.idOrigen,origen.codigoSucursal,origen.folioPedido,origen.numeroPedido,
            origen.fechaHoraPedido,origen.nombreVendedor,origen.esEspecial,origen.datos,1
          );

          IF @completo=1
            UPDATE destino SET activo=0, sincronizadoEn=SYSUTCDATETIME()
            FROM dbo.HistorialR1Snapshot destino
            WHERE destino.fechaHoraPedido>=@fechaDesde
              AND destino.fechaHoraPedido<DATEADD(day,1,@fechaHasta)
              AND NOT EXISTS(SELECT 1 FROM @snapshot origen WHERE origen.idOrigen=destino.idOrigen);
          COMMIT;
        END TRY
        BEGIN CATCH
          IF @@TRANCOUNT>0 ROLLBACK;
          THROW;
        END CATCH;
      `);
  }

  public async buscar(filtros: FiltrosHistorial): Promise<PaginaHistorial> {
    const { filas, total } = await this.leer(filtros, false);
    return {
      registros: filas.map(({ datos }) => filtrarArticulos(
        JSON.parse(datos) as PedidoHistorial, filtros.codigosAlmacen)),
      pagina: filtros.pagina,
      cantidadPorPagina: filtros.cantidadPorPagina,
      totalRegistros: total,
      hayMas: (filtros.pagina - 1) * filtros.cantidadPorPagina + filas.length < total,
    };
  }

  public async buscarArticulos(filtros: FiltrosHistorial): Promise<PaginaArticulosHistorial> {
    const { filas, total } = await this.leer(filtros, true);
    const registros = filas.flatMap((fila): ArticuloHistorial[] => {
      const pedido = JSON.parse(fila.datos) as PedidoHistorial;
      const articulo = fila.indiceArticulo === undefined ? undefined : pedido.articulos[fila.indiceArticulo];
      if (!articulo) return [];
      return [{
        ...articulo,
        identificadorDetalle: articulo.identificadorDetalle ?? null,
        idOrigen: pedido.idOrigen,
        numeroPedido: pedido.numeroPedido,
        fechaHoraPedido: pedido.fechaHoraPedido,
        fechaEntradaCola: pedido.fechaEntradaCola,
        despachadoEn: pedido.despachadoEn,
        validadoDetectadoEn: pedido.validadoDetectadoEn,
        nombreVendedor: pedido.nombreVendedor,
        esEspecial: pedido.esEspecial,
        estadoHistorial: pedido.estadoHistorial,
      }];
    });
    return {
      registros,
      pagina: filtros.pagina,
      cantidadPorPagina: filtros.cantidadPorPagina,
      totalRegistros: total,
      hayMas: (filtros.pagina - 1) * filtros.cantidadPorPagina + filas.length < total,
    };
  }

  public async obtener(idOrigen: string): Promise<PedidoHistorial | null> {
    await asegurarEsquema();
    const resultado = await obtenerPoolPedidosBodega().request()
      .input('idOrigen', sql.NVarChar(150), idOrigen)
      .query<FilaSnapshot>(`SELECT datos,sincronizadoEn FROM dbo.HistorialR1Snapshot
        WHERE idOrigen=@idOrigen AND activo=1;`);
    const fila = resultado.recordset[0];
    return fila ? JSON.parse(fila.datos) as PedidoHistorial : null;
  }

  private async leer(
    filtros: FiltrosHistorial,
    porArticulo: boolean,
  ): Promise<{ filas: FilaSnapshot[]; total: number }> {
    await asegurarEsquema();
    const solicitud = obtenerPoolPedidosBodega().request()
      .input('fechaDesde', sql.Date, filtros.fechaDesde)
      .input('fechaHasta', sql.Date, filtros.fechaHasta)
      .input('numeroPedido', sql.NVarChar(100), filtros.numeroPedido || null)
      .input('clasificacion', sql.VarChar(8), filtros.clasificacion ?? null)
      .input('inicio', sql.Int, (filtros.pagina - 1) * filtros.cantidadPorPagina)
      .input('cantidad', sql.Int, filtros.cantidadPorPagina);
    const almacenes = filtros.codigosAlmacen.map((codigo, indice) => {
      solicitud.input(`almacen${indice}`, sql.NVarChar(16), codigo);
      return `@almacen${indice}`;
    });
    const origen = `FROM dbo.HistorialR1Snapshot snapshot
      ${porArticulo ? "CROSS APPLY OPENJSON(snapshot.datos,'$.articulos') articulo" : ''}
      WHERE snapshot.activo=1
        AND snapshot.fechaHoraPedido>=@fechaDesde
        AND snapshot.fechaHoraPedido<DATEADD(day,1,@fechaHasta)
        AND (@numeroPedido IS NULL OR snapshot.numeroPedido LIKE CONCAT('%',@numeroPedido,'%'))
        AND (@clasificacion IS NULL
          OR (@clasificacion='especial' AND snapshot.esEspecial=1)
          OR (@clasificacion='normal' AND snapshot.esEspecial=0))
        ${almacenes.length ? porArticulo
          ? `AND JSON_VALUE(articulo.value,'$.codigoAlmacen') IN (${almacenes.join(',')})`
          : `AND EXISTS(SELECT 1 FROM OPENJSON(snapshot.datos,'$.articulos') WITH(
              codigoAlmacen nvarchar(16) '$.codigoAlmacen') linea
              WHERE linea.codigoAlmacen IN (${almacenes.join(',')}))` : ''}`;
    const resultado = await solicitud.query<FilaSnapshot>(`
      SELECT snapshot.datos,snapshot.sincronizadoEn
        ${porArticulo ? ',TRY_CONVERT(int,articulo.[key]) indiceArticulo' : ''}
      ${origen}
      ORDER BY snapshot.fechaHoraPedido DESC,snapshot.idOrigen DESC
        ${porArticulo ? ',TRY_CONVERT(int,articulo.[key])' : ''}
      OFFSET @inicio ROWS FETCH NEXT @cantidad ROWS ONLY;
      SELECT COUNT(*) total ${origen};
    `);
    const conjuntos = resultado.recordsets as sql.IRecordSet<FilaSnapshot>[];
    return { filas: resultado.recordset, total: Number(conjuntos[1]?.[0]?.total ?? 0) };
  }
}
