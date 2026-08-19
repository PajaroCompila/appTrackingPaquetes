import sql from 'mssql';
import { consultarSap } from '../../infraestructura/sql/consultaSap.js';
import type { InventarioArticulo } from './inventarioArticulo.interface.js';

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

  public async obtener(
    codigoArticulo: string,
    codigoAlmacen: string,
  ): Promise<InventarioArticulo | null> {
    const resultado = await this.consultar<FilaInventarioArticulo>(`
      SELECT TOP (200)
        articulo.[ItemCode] AS codigoArticulo,
        articulo.[ItemName] AS descripcion,
        inventario.[WhsCode] AS codigoAlmacen,
        almacen.[WhsName] AS nombreAlmacen,
        inventario.[OnHand] AS existenciaFisica,
        CASE WHEN inventario.[WhsCode] = @codigoAlmacen THEN 1 ELSE 0 END AS esAlmacenConsultado
      FROM [dbo].[OITM] articulo
      INNER JOIN [dbo].[OITW] inventario
        ON inventario.[ItemCode] = articulo.[ItemCode]
      INNER JOIN [dbo].[OWHS] almacen
        ON almacen.[WhsCode] = inventario.[WhsCode]
      WHERE articulo.[ItemCode] = @codigoArticulo
        AND (inventario.[OnHand] > 0 OR inventario.[WhsCode] = @codigoAlmacen)
      ORDER BY
        CASE WHEN inventario.[WhsCode] = @codigoAlmacen THEN 0 ELSE 1 END,
        almacen.[WhsName],
        inventario.[WhsCode];
    `, (solicitud) => solicitud
      .input('codigoArticulo', sql.NVarChar(100), codigoArticulo)
      .input('codigoAlmacen', sql.NVarChar(16), codigoAlmacen));

    const filas = resultado.recordset;
    const seleccionada = filas.find(({ esAlmacenConsultado }) => Boolean(esAlmacenConsultado));
    if (!seleccionada) return null;

    return {
      codigoArticulo: seleccionada.codigoArticulo.trim(),
      descripcion: seleccionada.descripcion.trim(),
      codigoAlmacen: seleccionada.codigoAlmacen.trim(),
      nombreAlmacen: seleccionada.nombreAlmacen.trim(),
      existenciaFisica: Number(seleccionada.existenciaFisica),
      existencias: filas
        .filter(({ existenciaFisica }) => Number(existenciaFisica) > 0)
        .map((fila) => ({
          codigoAlmacen: fila.codigoAlmacen.trim(),
          nombreAlmacen: fila.nombreAlmacen.trim(),
          existenciaFisica: Number(fila.existenciaFisica),
        })),
    };
  }
}
