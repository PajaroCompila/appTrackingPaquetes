import sql from 'mssql';
import { obtenerPoolPedidosBodega } from '../../infraestructura/sql/conexionPedidosBodega.js';
import { MIGRACION_REFERENCIA_PEDIDO_SAP_R1 } from './referenciaPedidoSapR1Migracion.js';

export interface ReferenciaPedidoSapR1 {
  idOrigen: string;
  codigoSucursal: string;
  folioPedido: string;
  sapDocEntry: number;
  numeroPedidoSap: string;
}

interface PedidoConReferenciaSapR1 {
  idOrigen: string;
  origenPedido: string;
  folioPedido: string;
  numeroPedido: string;
  sapDocEntry: string | null;
}

export function resolverNumeroPedidoMostrado(
  folioR1: string,
  numeroPedidoSap: string | number | null | undefined,
): string {
  return numeroPedidoSap === null || numeroPedidoSap === undefined || String(numeroPedidoSap).trim() === ''
    ? folioR1 : String(numeroPedidoSap).trim();
}

export function aplicarReferenciaSapR1<T extends PedidoConReferenciaSapR1>(
  pedido: T,
  referencia: ReferenciaPedidoSapR1 | undefined,
): T {
  if (!referencia || pedido.origenPedido !== 'R1') return pedido;
  return { ...pedido,
    numeroPedido: resolverNumeroPedidoMostrado(pedido.folioPedido, referencia.numeroPedidoSap),
    sapDocEntry: String(referencia.sapDocEntry) };
}

let migracionEnCurso: Promise<void> | null = null;

async function asegurarEsquema(): Promise<void> {
  migracionEnCurso ??= obtenerPoolPedidosBodega().request()
    .query(MIGRACION_REFERENCIA_PEDIDO_SAP_R1).then(() => undefined)
    .catch((error) => {
      migracionEnCurso = null;
      throw error;
    });
  return migracionEnCurso;
}

export class ReferenciaPedidoSapR1Repositorio {
  public async obtener(idsOrigen: string[]): Promise<Map<string, ReferenciaPedidoSapR1>> {
    if (idsOrigen.length === 0) return new Map();
    await asegurarEsquema();
    const resultado = await obtenerPoolPedidosBodega().request()
      .input('ids', sql.NVarChar(sql.MAX), JSON.stringify([...new Set(idsOrigen)]))
      .query<ReferenciaPedidoSapR1>(`SELECT referencia.idOrigen,referencia.codigoSucursal,
          referencia.folioPedido,referencia.sapDocEntry,referencia.numeroPedidoSap
        FROM dbo.ReferenciaPedidoSapR1 referencia
        JOIN OPENJSON(@ids) ids ON ids.value=referencia.idOrigen;`);
    return new Map(resultado.recordset.map((referencia) => [referencia.idOrigen, referencia]));
  }

  public async buscarPorIdentificador(identificador: string): Promise<ReferenciaPedidoSapR1 | null> {
    const valor = identificador.trim();
    if (!valor) return null;
    await asegurarEsquema();
    const resultado = await obtenerPoolPedidosBodega().request()
      .input('identificador', sql.NVarChar(100), valor)
      .query<ReferenciaPedidoSapR1>(`SELECT referencia.idOrigen,referencia.codigoSucursal,
          referencia.folioPedido,referencia.sapDocEntry,referencia.numeroPedidoSap
        FROM dbo.ReferenciaPedidoSapR1 referencia
        WHERE referencia.folioPedido=@identificador
          OR referencia.numeroPedidoSap=@identificador;`);
    return resultado.recordset.length === 1 ? resultado.recordset[0]! : null;
  }

  public async priorizar<T extends PedidoConReferenciaSapR1>(pedidos: T[]): Promise<T[]> {
    const referencias = await this.obtener(pedidos.filter(({ origenPedido }) => origenPedido === 'R1')
      .map(({ idOrigen }) => idOrigen));
    return pedidos.map((pedido) => aplicarReferenciaSapR1(pedido, referencias.get(pedido.idOrigen)));
  }

  public async guardar(referencias: ReferenciaPedidoSapR1[]): Promise<string[]> {
    if (referencias.length === 0) return [];
    await asegurarEsquema();
    const resultado = await obtenerPoolPedidosBodega().request()
      .input('referencias', sql.NVarChar(sql.MAX), JSON.stringify(referencias))
      .query<{ folioPedido: string }>(`
        IF DB_NAME() <> N'PedidosBodega' THROW 51000, 'Base no autorizada.', 1;
        SET XACT_ABORT ON;
        BEGIN TRANSACTION;
        BEGIN TRY
          DECLARE @entrada TABLE(
            idOrigen nvarchar(150) PRIMARY KEY,
            codigoSucursal nvarchar(16) NOT NULL,
            folioPedido nvarchar(100) NOT NULL,
            sapDocEntry int NOT NULL,
            numeroPedidoSap nvarchar(100) NOT NULL
          );
          INSERT @entrada(idOrigen,codigoSucursal,folioPedido,sapDocEntry,numeroPedidoSap)
          SELECT idOrigen,codigoSucursal,folioPedido,sapDocEntry,numeroPedidoSap
          FROM OPENJSON(@referencias) WITH(
            idOrigen nvarchar(150),codigoSucursal nvarchar(16),folioPedido nvarchar(100),
            sapDocEntry int,numeroPedidoSap nvarchar(100));

          DECLARE @ambiguos TABLE(folioPedido nvarchar(100) PRIMARY KEY);
          INSERT @ambiguos(folioPedido)
          SELECT DISTINCT entrada.folioPedido FROM @entrada entrada
          JOIN dbo.ReferenciaPedidoSapR1 existente ON
            (existente.idOrigen=entrada.idOrigen AND
              (existente.sapDocEntry<>entrada.sapDocEntry
                OR existente.numeroPedidoSap<>entrada.numeroPedidoSap
                OR existente.codigoSucursal<>entrada.codigoSucursal
                OR existente.folioPedido<>entrada.folioPedido))
            OR (existente.idOrigen<>entrada.idOrigen AND
              (existente.sapDocEntry=entrada.sapDocEntry
                OR existente.numeroPedidoSap=entrada.numeroPedidoSap
                OR (existente.codigoSucursal=entrada.codigoSucursal
                  AND existente.folioPedido=entrada.folioPedido)));
          DELETE entrada FROM @entrada entrada JOIN @ambiguos ambiguo
            ON ambiguo.folioPedido=entrada.folioPedido;

          MERGE dbo.ReferenciaPedidoSapR1 WITH(HOLDLOCK) destino
          USING @entrada origen ON origen.idOrigen=destino.idOrigen
          WHEN NOT MATCHED THEN INSERT(
            idOrigen,codigoSucursal,folioPedido,sapDocEntry,numeroPedidoSap
          ) VALUES(
            origen.idOrigen,origen.codigoSucursal,origen.folioPedido,
            origen.sapDocEntry,origen.numeroPedidoSap
          );

          IF OBJECT_ID(N'dbo.HistorialR1Snapshot',N'U') IS NOT NULL
            UPDATE snapshot SET numeroPedido=referencia.numeroPedidoSap,
              datos=JSON_MODIFY(JSON_MODIFY(snapshot.datos,'$.numeroPedido',referencia.numeroPedidoSap),
                '$.sapDocEntry',CONVERT(nvarchar(50),referencia.sapDocEntry)),
              sincronizadoEn=SYSUTCDATETIME()
            FROM dbo.HistorialR1Snapshot snapshot JOIN @entrada referencia
              ON referencia.idOrigen=snapshot.idOrigen;

          IF OBJECT_ID(N'dbo.PedidoDespachado',N'U') IS NOT NULL
            UPDATE pedido SET numeroPedido=referencia.numeroPedidoSap,
              sapDocEntry=CONVERT(nvarchar(50),referencia.sapDocEntry),
              actualizadoEn=SYSUTCDATETIME()
            FROM dbo.PedidoDespachado pedido JOIN @entrada referencia
              ON pedido.idOrigen=referencia.idOrigen
                OR (referencia.codigoSucursal='TSPS01'
                  AND pedido.idOrigen=CONCAT('R1:',referencia.folioPedido));

          IF OBJECT_ID(N'dbo.DevolucionPedido',N'U') IS NOT NULL
            UPDATE devolucion SET numeroPedido=referencia.numeroPedidoSap
            FROM dbo.DevolucionPedido devolucion JOIN @entrada referencia
              ON devolucion.idOrigen=referencia.idOrigen
                OR (referencia.codigoSucursal='TSPS01'
                  AND devolucion.idOrigen=CONCAT('R1:',referencia.folioPedido));

          IF OBJECT_ID(N'dbo.ControlOperativoPedido',N'U') IS NOT NULL
            UPDATE control SET cabecera=JSON_MODIFY(JSON_MODIFY(control.cabecera,
                '$.numeroPedido',referencia.numeroPedidoSap),
                '$.sapDocEntry',CONVERT(nvarchar(50),referencia.sapDocEntry)),
              actualizadoEn=SYSUTCDATETIME()
            FROM dbo.ControlOperativoPedido control JOIN @entrada referencia
              ON control.idOrigen=referencia.idOrigen
                OR (referencia.codigoSucursal='TSPS01'
                  AND control.idOrigen=CONCAT('R1:',referencia.folioPedido))
            WHERE ISJSON(control.cabecera)=1;
          COMMIT;
          SELECT folioPedido FROM @ambiguos ORDER BY folioPedido;
        END TRY
        BEGIN CATCH
          IF @@TRANCOUNT>0 ROLLBACK;
          THROW;
        END CATCH;
      `);
    return resultado.recordset.map(({ folioPedido }) => folioPedido);
  }
}
