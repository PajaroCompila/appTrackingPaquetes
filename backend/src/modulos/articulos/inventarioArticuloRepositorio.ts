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
  ultimaFechaIngreso: string | null;
  ultimaCantidadIngreso: number | null;
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
    const almacenes = codigosAlmacen?.map((codigo) => codigo.trim()).filter(Boolean) ?? [];
    const parametrosAlmacenes = almacenes.map((_, indice) => `@codigoAlmacen${indice}`);
    const filtroAlmacenes = parametrosAlmacenes.length > 0 ? `
        AND EXISTS (
          SELECT 1
          FROM [dbo].[OITW] inventarioVisible
          WHERE inventarioVisible.[ItemCode] = articulo.[ItemCode]
            AND inventarioVisible.[WhsCode] IN (${parametrosAlmacenes.join(', ')})
        )` : '';
    const resultado = await this.consultar<CoincidenciaInventarioArticulo>(`
      SELECT TOP (@limite)
        articulo.[ItemCode] AS codigoArticulo,
        articulo.[ItemName] AS descripcion
      FROM [dbo].[OITM] articulo
      WHERE (articulo.[ItemCode] LIKE @coincidencia ESCAPE '\\'
        OR articulo.[ItemName] LIKE @coincidencia ESCAPE '\\')
        ${filtroAlmacenes}
      ORDER BY
        CASE
          WHEN articulo.[ItemCode] = @termino THEN 0
          WHEN articulo.[ItemCode] LIKE @inicio ESCAPE '\\' THEN 1
          WHEN articulo.[ItemName] LIKE @inicio ESCAPE '\\' THEN 2
          ELSE 3
        END,
        articulo.[ItemCode];
    `, (solicitud) => {
      solicitud
        .input('termino', sql.NVarChar(100), terminoLimpio)
        .input('coincidencia', sql.NVarChar(202), coincidencia)
        .input('inicio', sql.NVarChar(201), inicio)
        .input('limite', sql.Int, limite);
      almacenes.forEach((codigo, indice) => {
        solicitud.input(`codigoAlmacen${indice}`, sql.NVarChar(16), codigo);
      });
      return solicitud;
    });

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
        CASE WHEN @codigoAlmacen IS NOT NULL AND inventario.[WhsCode] = @codigoAlmacen THEN 1 ELSE 0 END AS esAlmacenConsultado,
        ultimoIngreso.[ultimaFechaIngreso],
        ultimoIngreso.[ultimaCantidadIngreso]
      FROM [dbo].[OITM] articulo
      INNER JOIN [dbo].[OITW] inventario
        ON inventario.[ItemCode] = articulo.[ItemCode]
      INNER JOIN [dbo].[OWHS] almacen
        ON almacen.[WhsCode] = inventario.[WhsCode]
      OUTER APPLY (
        SELECT TOP (1)
          CONVERT(char(10), movimiento.[DocDate], 23) AS ultimaFechaIngreso,
          movimiento.[InQty] AS ultimaCantidadIngreso
        FROM [dbo].[OINM] movimiento
        WHERE movimiento.[ItemCode] = articulo.[ItemCode]
          AND movimiento.[InQty] > 0
        ORDER BY movimiento.[DocDate] DESC, movimiento.[DocTime] DESC,
          movimiento.[TransNum] DESC, movimiento.[TransSeq] DESC
      ) ultimoIngreso
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
    const fechaIngreso = seleccionada.ultimaFechaIngreso?.trim() ?? '';
    const cantidadIngreso = seleccionada.ultimaCantidadIngreso === null
      || seleccionada.ultimaCantidadIngreso === undefined
      ? null : Number(seleccionada.ultimaCantidadIngreso);
    const ultimoIngresoValido = /^\d{4}-\d{2}-\d{2}$/.test(fechaIngreso)
      && cantidadIngreso !== null && Number.isFinite(cantidadIngreso) && cantidadIngreso > 0;

    return {
      codigoArticulo: seleccionada.codigoArticulo.trim(),
      descripcion: seleccionada.descripcion.trim(),
      codigoAlmacen: seleccionada.codigoAlmacen.trim(),
      nombreAlmacen: seleccionada.nombreAlmacen.trim(),
      existenciaFisica: Number(seleccionada.existenciaFisica),
      ultimaFechaIngreso: ultimoIngresoValido ? fechaIngreso : null,
      ultimaCantidadIngreso: ultimoIngresoValido ? cantidadIngreso : null,
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
