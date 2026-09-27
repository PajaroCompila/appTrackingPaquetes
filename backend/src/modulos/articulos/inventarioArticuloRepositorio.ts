import sql from 'mssql';
import { consultarSap } from '../../infraestructura/sql/consultaSap.js';
import type { InventarioArticulo } from './inventarioArticulo.interface.js';

export type ConsultarInventarioSap = typeof consultarSap;
17
export class InventarioArticuloRepositorio {
  public constructor(private readonly consultar: ConsultarInventarioSap = consultarSap) {}

  public async obtener(
    codigoArticulo: string,
    codigoAlmacen: string,
  ): Promise<InventarioArticulo | null> {
    const resultado = await this.consultar<InventarioArticulo>(`
      SELECT TOP (1)
        articulo.[ItemCode] AS codigoArticulo,
        articulo.[ItemName] AS descripcion,
        inventario.[WhsCode] AS codigoAlmacen,
        almacen.[WhsName] AS nombreAlmacen,
        inventario.[OnHand] AS existenciaFisica
      FROM [dbo].[OITM] articulo
      INNER JOIN [dbo].[OITW] inventario
        ON inventario.[ItemCode] = articulo.[ItemCode]
      INNER JOIN [dbo].[OWHS] almacen
        ON almacen.[WhsCode] = inventario.[WhsCode]
      WHERE articulo.[ItemCode] = @codigoArticulo
        AND inventario.[WhsCode] = @codigoAlmacen;
    `, (solicitud) => solicitud
      .input('codigoArticulo', sql.NVarChar(100), codigoArticulo)
      .input('codigoAlmacen', sql.NVarChar(16), codigoAlmacen));

    const fila = resultado.recordset[0];
    return fila ? {
      codigoArticulo: fila.codigoArticulo.trim(),
      descripcion: fila.descripcion.trim(),
      codigoAlmacen: fila.codigoAlmacen.trim(),
      nombreAlmacen: fila.nombreAlmacen.trim(),
      existenciaFisica: Number(fila.existenciaFisica),
    } : null;
  }
}

