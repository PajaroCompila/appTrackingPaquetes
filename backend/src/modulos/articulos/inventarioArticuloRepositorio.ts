import sql from 'mssql';
import { consultarSap } from '../../infraestructura/sql/consultaSap.js';
import type { CoincidenciaInventarioArticulo, InventarioArticulo } from './inventarioArticulo.interface.js';

interface FilaInventarioArticulo {
  codigoArticulo: string;
  descripcion: string;
  codigoAlmacen: string;
  nombreAlmacen: string;
  existenciaFisica: number;
  esAlmacenConsultado: boolean | number;
}

export type ConsultarInventarioSap = typeof consultarSap;

export class InventarioArticuloRepositorio {
  public constructor(private readonly consultar: ConsultarInventarioSap = consultarSap) {}

  public async buscar(
    termino: string,
    limite: number,
    codigosAlmacen?: readonly string[],
  ): Promise<CoincidenciaInventarioArticulo[]> {
    const escaparLike = (valor: string) => valor.replace(/[\\%_[\]]/g, '\\$&');
    const terminoLimpio = termino.trim();
    const coincidencia = `%${escaparLike(terminoLimpio)}%`;
    const inicio = `${escaparLike(terminoLimpio)}%`;
    const almacenesJson = codigosAlmacen?.length ? JSON.stringify(codigosAlmacen) : null;
    const resultado = await this.consultar<CoincidenciaInventarioArticulo>(`
      SELECT TOP (@limite)
        articulo.[ItemCode] AS codigoArticulo,
        articulo.[ItemName] AS descripcion
      FROM [dbo].[OITM] articulo
      WHERE (articulo.[ItemCode] LIKE @coincidencia ESCAPE '\\'
        OR articulo.[ItemName] LIKE @coincidencia ESCAPE '\\')
        AND (@almacenesJson IS NULL OR EXISTS (
          SELECT 1
          FROM [dbo].[OITW] inventarioVisible
          INNER JOIN OPENJSON(@almacenesJson)
            WITH (codigoAlmacen nvarchar(16) '$') permiso
            ON permiso.codigoAlmacen = inventarioVisible.[WhsCode]
          WHERE inventarioVisible.[ItemCode] = articulo.[ItemCode]
        ))
      ORDER BY
        CASE
          WHEN articulo.[ItemCode] = @termino THEN 0
          WHEN articulo.[ItemCode] LIKE @inicio ESCAPE '\\' THEN 1
          WHEN articulo.[ItemName] LIKE @inicio ESCAPE '\\' THEN 2
          ELSE 3
        END,
        articulo.[ItemCode];
    `, (solicitud) => solicitud
      .input('termino', sql.NVarChar(100), terminoLimpio)
      .input('coincidencia', sql.NVarChar(202), coincidencia)
      .input('inicio', sql.NVarChar(201), inicio)
      .input('limite', sql.Int, limite)
      .input('almacenesJson', sql.NVarChar(sql.MAX), almacenesJson));

    return resultado.recordset.map((fila) => ({
      codigoArticulo: fila.codigoArticulo.trim(),
      descripcion: fila.descripcion?.trim() || 'Sin descripción',
    }));
  }

  public async obtener(
    codigoArticulo: string,
    codigoAlmacen?: string,
  ): Promise<InventarioArticulo | null> {
    const resultado = await this.consultar<FilaInventarioArticulo>(`
      SELECT TOP (200)
        articulo.[ItemCode] AS codigoArticulo,
        articulo.[ItemName] AS descripcion,
        inventario.[WhsCode] AS codigoAlmacen,
        almacen.[WhsName] AS nombreAlmacen,
        inventario.[OnHand] AS existenciaFisica,
        CASE WHEN @codigoAlmacen IS NOT NULL AND inventario.[WhsCode] = @codigoAlmacen THEN 1 ELSE 0 END AS esAlmacenConsultado
      FROM [dbo].[OITM] articulo
      INNER JOIN [dbo].[OITW] inventario
        ON inventario.[ItemCode] = articulo.[ItemCode]
      INNER JOIN [dbo].[OWHS] almacen
        ON almacen.[WhsCode] = inventario.[WhsCode]
      WHERE articulo.[ItemCode] = @codigoArticulo
        AND (@codigoAlmacen IS NULL OR inventario.[OnHand] > 0 OR inventario.[WhsCode] = @codigoAlmacen)
      ORDER BY
        CASE WHEN inventario.[WhsCode] = @codigoAlmacen THEN 0 ELSE 1 END,
        almacen.[WhsName],
        inventario.[WhsCode];
    `, (solicitud) => solicitud
      .input('codigoArticulo', sql.NVarChar(100), codigoArticulo)
      .input('codigoAlmacen', sql.NVarChar(16), codigoAlmacen ?? null));

    const filas = resultado.recordset;
    const seleccionada = codigoAlmacen
      ? filas.find(({ esAlmacenConsultado }) => Boolean(esAlmacenConsultado))
      : filas[0];
    if (!seleccionada) return null;

    return {
      codigoArticulo: seleccionada.codigoArticulo.trim(),
      descripcion: seleccionada.descripcion.trim(),
      codigoAlmacen: seleccionada.codigoAlmacen.trim(),
      nombreAlmacen: seleccionada.nombreAlmacen.trim(),
      existenciaFisica: Number(seleccionada.existenciaFisica),
      existencias: filas
        .filter(({ existenciaFisica }) => !codigoAlmacen || Number(existenciaFisica) > 0)
        .map((fila) => ({
          codigoAlmacen: fila.codigoAlmacen.trim(),
          nombreAlmacen: fila.nombreAlmacen.trim(),
          existenciaFisica: Number(fila.existenciaFisica),
        })),
    };
  }
}
