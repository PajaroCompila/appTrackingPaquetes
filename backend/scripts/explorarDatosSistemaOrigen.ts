import 'dotenv/config';
import sql from 'mssql';
import { obtenerConfiguracionSql } from '../src/configuracion/configuracionSql.js';
import { crearPoolSistemaOrigen } from '../src/infraestructura/sql/crearPoolSistemaOrigen.js';

async function explorarDatosSistemaOrigen(): Promise<void> {
  const pool = crearPoolSistemaOrigen(obtenerConfiguracionSql());

  try {
    await pool.connect();

    const almacenes = await pool.request().input('limite', sql.Int, 100).query(`
      SELECT TOP (@limite)
        almacen.[WhsCode] AS codigoAlmacen,
        almacen.[WhsName] AS nombreAlmacen,
        almacen.[Inactive] AS indicadorInactivo
      FROM [dbo].[OWHS] AS almacen
      ORDER BY almacen.[WhsCode];
    `);

    const solicitudCampos = pool.request();
    solicitudCampos.input('tablaVenta', sql.NVarChar(128), '@SO1_01VENTA');
    solicitudCampos.input('tablaDetalle', sql.NVarChar(128), '@SO1_01VENTADETALLE');
    const camposEstado = await solicitudCampos.query(`
      SELECT TOP (100)
        definicion.[TableID] AS identificadorTabla,
        definicion.[FieldID] AS identificadorCampo,
        definicion.[AliasID] AS aliasCampo,
        definicion.[Descr] AS descripcionCampo,
        definicion.[Dflt] AS valorPredeterminado,
        valor.[FldValue] AS codigoValor,
        valor.[Descr] AS descripcionValor
      FROM [dbo].[CUFD] AS definicion
      LEFT JOIN [dbo].[UFD1] AS valor
        ON valor.[TableID] = definicion.[TableID]
       AND valor.[FieldID] = definicion.[FieldID]
      WHERE definicion.[TableID] IN (@tablaVenta, @tablaDetalle)
        AND (
          definicion.[AliasID] LIKE '%STATUS%'
          OR definicion.[AliasID] LIKE '%ESTADO%'
          OR definicion.[AliasID] LIKE '%SINCRONIZADO%'
          OR definicion.[AliasID] LIKE '%ENTREGA%'
        )
      ORDER BY definicion.[TableID], definicion.[FieldID], valor.[IndexID];
    `);

    const ubicacionCamposEstado = await pool.request().query(`
      SELECT TOP (100)
        definicion.[TableID] AS identificadorTabla,
        definicion.[FieldID] AS identificadorCampo,
        definicion.[AliasID] AS aliasCampo,
        definicion.[Descr] AS descripcionCampo
      FROM [dbo].[CUFD] AS definicion
      WHERE definicion.[TableID] LIKE '%SO1_01VENTA%'
         OR definicion.[AliasID] LIKE '%STATUS%'
         OR definicion.[AliasID] LIKE '%ESTADO%'
         OR definicion.[AliasID] LIKE '%SINCRONIZADO%'
      ORDER BY definicion.[TableID], definicion.[FieldID];
    `);

    const conteosCatalogos = await pool.request().query(`
      SELECT
        (SELECT COUNT_BIG(1) FROM [dbo].[CUFD]) AS totalDefinicionesCampos,
        (SELECT COUNT_BIG(1) FROM [dbo].[UFD1]) AS totalValoresValidos;
    `);

    const estadosCabecera = await pool.request().query(`
      SELECT TOP (20)
        venta.[U_SO1_STATUS] AS codigoEstado,
        venta.[U_SO1_SINCRONIZADO] AS codigoSincronizacion,
        COUNT_BIG(1) AS cantidadRegistros
      FROM [dbo].[@SO1_01VENTA] AS venta
      GROUP BY venta.[U_SO1_STATUS], venta.[U_SO1_SINCRONIZADO]
      ORDER BY COUNT_BIG(1) DESC;
    `);

    const estadosDetalle = await pool.request().query(`
      SELECT TOP (20)
        detalle.[U_SO1_STATUSENTREGA] AS codigoEstadoEntrega,
        COUNT_BIG(1) AS cantidadRegistros
      FROM [dbo].[@SO1_01VENTADETALLE] AS detalle
      GROUP BY detalle.[U_SO1_STATUSENTREGA]
      ORDER BY COUNT_BIG(1) DESC;
    `);

    const coberturaRelacion = await pool.request().query(`
      SELECT
        (SELECT COUNT_BIG(1)
         FROM [dbo].[@SO1_01VENTADETALLE]) AS totalDetalles,
        (SELECT COUNT_BIG(1)
         FROM [dbo].[@SO1_01VENTADETALLE] AS detalle
         WHERE detalle.[U_SO1_FOLIO] IS NULL) AS detallesSinFolio,
        (SELECT COUNT_BIG(1)
         FROM [dbo].[@SO1_01VENTADETALLE] AS detalle
         WHERE EXISTS (
           SELECT 1
           FROM [dbo].[@SO1_01VENTA] AS venta
           WHERE venta.[Name] = detalle.[U_SO1_FOLIO]
         )) AS coincidenciasConName,
        (SELECT COUNT_BIG(1)
         FROM [dbo].[@SO1_01VENTADETALLE] AS detalle
         WHERE EXISTS (
           SELECT 1
           FROM [dbo].[@SO1_01VENTA] AS venta
           WHERE venta.[Code] = detalle.[U_SO1_FOLIO]
         )) AS coincidenciasConCode;
    `);

    console.log(
      JSON.stringify(
        {
          almacenes: almacenes.recordset,
          camposEstado: camposEstado.recordset,
          ubicacionCamposEstado: ubicacionCamposEstado.recordset,
          conteosCatalogos: conteosCatalogos.recordset[0],
          estadosCabecera: estadosCabecera.recordset,
          estadosDetalle: estadosDetalle.recordset,
          coberturaRelacion: coberturaRelacion.recordset[0],
        },
        null,
        2,
      ),
    );
  } finally {
    await pool.close();
  }
}

explorarDatosSistemaOrigen().catch((error: unknown) => {
  const codigo = error instanceof sql.ConnectionError ? 'ERROR_CONEXION_SQL' : 'ERROR_EXPLORACION_SQL';
  console.error(codigo);
  process.exitCode = 1;
});
