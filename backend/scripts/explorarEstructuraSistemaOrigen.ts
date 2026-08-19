import 'dotenv/config';
import sql from 'mssql';
import { obtenerConfiguracionSql } from '../src/configuracion/configuracionSql.js';
import { crearPoolSistemaOrigen } from '../src/infraestructura/sql/crearPoolSistemaOrigen.js';

interface ColumnaTabla {
  nombreEsquema: string;
  nombreTabla: string;
  posicion: number;
  nombreColumna: string;
  tipoDato: string;
  permiteNulos: boolean;
}

interface IndiceTabla {
  nombreTabla: string;
  nombreIndice: string;
  esLlavePrimaria: boolean;
  esUnico: boolean;
  posicionLlave: number;
  nombreColumna: string;
}

async function explorarEstructuraSistemaOrigen(): Promise<void> {
  const pool = crearPoolSistemaOrigen(obtenerConfiguracionSql());

  try {
    await pool.connect();
    const solicitudColumnas = pool.request();
    ['OWHS', 'CUFD', 'UFD1', '@SO1_01VENTA', '@SO1_01VENTADETALLE'].forEach(
      (nombreTabla, indice) => solicitudColumnas.input(`tabla${indice}`, sql.NVarChar(128), nombreTabla),
    );

    const columnas = await solicitudColumnas.query<ColumnaTabla>(`
      SELECT
        esquema.[name] AS nombreEsquema,
        tabla.[name] AS nombreTabla,
        columna.[column_id] AS posicion,
        columna.[name] AS nombreColumna,
        tipo.[name] AS tipoDato,
        columna.[is_nullable] AS permiteNulos
      FROM [sys].[tables] AS tabla
      INNER JOIN [sys].[schemas] AS esquema
        ON esquema.[schema_id] = tabla.[schema_id]
      INNER JOIN [sys].[columns] AS columna
        ON columna.[object_id] = tabla.[object_id]
      INNER JOIN [sys].[types] AS tipo
        ON tipo.[user_type_id] = columna.[user_type_id]
      WHERE tabla.[name] IN (@tabla0, @tabla1, @tabla2, @tabla3, @tabla4)
      ORDER BY tabla.[name], columna.[column_id];
    `);

    const solicitudIndices = pool.request();
    solicitudIndices.input('tablaVenta', sql.NVarChar(128), '@SO1_01VENTA');
    solicitudIndices.input('tablaDetalle', sql.NVarChar(128), '@SO1_01VENTADETALLE');
    const indices = await solicitudIndices.query<IndiceTabla>(`
      SELECT
        tabla.[name] AS nombreTabla,
        indice.[name] AS nombreIndice,
        indice.[is_primary_key] AS esLlavePrimaria,
        indice.[is_unique] AS esUnico,
        columnaIndice.[key_ordinal] AS posicionLlave,
        columna.[name] AS nombreColumna
      FROM [sys].[tables] AS tabla
      INNER JOIN [sys].[indexes] AS indice
        ON indice.[object_id] = tabla.[object_id]
      INNER JOIN [sys].[index_columns] AS columnaIndice
        ON columnaIndice.[object_id] = indice.[object_id]
       AND columnaIndice.[index_id] = indice.[index_id]
      INNER JOIN [sys].[columns] AS columna
        ON columna.[object_id] = columnaIndice.[object_id]
       AND columna.[column_id] = columnaIndice.[column_id]
      WHERE tabla.[name] IN (@tablaVenta, @tablaDetalle)
        AND columnaIndice.[key_ordinal] > 0
      ORDER BY tabla.[name], indice.[name], columnaIndice.[key_ordinal];
    `);

    const porTabla = Object.groupBy(columnas.recordset, ({ nombreTabla }) => nombreTabla);
    const resumenColumnas = Object.fromEntries(
      Object.entries(porTabla).map(([nombreTabla, columnasTabla]) => [
        nombreTabla,
        {
          esquema: columnasTabla?.[0]?.nombreEsquema,
          cantidadColumnas: columnasTabla?.length ?? 0,
          columnas: columnasTabla?.map(({ nombreColumna, tipoDato, permiteNulos }) => ({
            nombreColumna,
            tipoDato,
            permiteNulos,
          })),
        },
      ]),
    );

    console.log(JSON.stringify({ tablas: resumenColumnas, indices: indices.recordset }, null, 2));
  } finally {
    await pool.close();
  }
}

explorarEstructuraSistemaOrigen().catch((error: unknown) => {
  const codigo = error instanceof sql.ConnectionError ? 'ERROR_CONEXION_SQL' : 'ERROR_ESTRUCTURA_SQL';
  console.error(codigo);
  process.exitCode = 1;
});
