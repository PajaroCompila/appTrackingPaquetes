import 'dotenv/config';
import sql from 'mssql';
import { obtenerConfiguracionSql } from '../src/configuracion/configuracionSql.js';
import { crearPoolSistemaOrigen } from '../src/infraestructura/sql/crearPoolSistemaOrigen.js';

interface BaseDisponible {
  nombreBaseDatos: string;
}

interface PrivilegiosCuenta {
  esAdministradorServidor: number | null;
  tieneControlServidor: boolean;
}

interface ObjetoEncontrado {
  nombreObjeto: string;
}

const objetosRequeridos = [
  'CUFD',
  'UFD1',
  'OWHS',
  '@SO1_01VENTA',
  '@SO1_01VENTADETALLE',
] as const;

async function diagnosticarBaseSistemaOrigen(): Promise<void> {
  const configuracionSql = obtenerConfiguracionSql();
  const poolMaster = crearPoolSistemaOrigen({ ...configuracionSql, baseDatos: 'master' });

  try {
    await poolMaster.connect();

    const resultadoPrivilegios = await poolMaster.request().query<PrivilegiosCuenta>(`
      SELECT
        IS_SRVROLEMEMBER('sysadmin') AS esAdministradorServidor,
        CAST(HAS_PERMS_BY_NAME(NULL, 'SERVER', 'CONTROL SERVER') AS bit) AS tieneControlServidor;
    `);

    const resultadoBases = await poolMaster.request().query<BaseDisponible>(`
      SELECT
        baseDatos.[name] AS nombreBaseDatos
      FROM [sys].[databases] AS baseDatos
      WHERE baseDatos.[state] = 0
        AND HAS_DBACCESS(baseDatos.[name]) = 1
      ORDER BY baseDatos.[name];
    `);

    const basesDisponibles = resultadoBases.recordset.map(({ nombreBaseDatos }) => nombreBaseDatos);
    const basesCandidatas: string[] = [];

    for (const nombreBaseDatos of basesDisponibles) {
      const poolBase = crearPoolSistemaOrigen({ ...configuracionSql, baseDatos: nombreBaseDatos });

      try {
        await poolBase.connect();
        const solicitud = poolBase.request();
        objetosRequeridos.forEach((nombreObjeto, indice) => {
          solicitud.input(`objeto${indice}`, sql.NVarChar(128), nombreObjeto);
        });

        const resultadoObjetos = await solicitud.query<ObjetoEncontrado>(`
          SELECT DISTINCT
            tabla.[name] AS nombreObjeto
          FROM [sys].[tables] AS tabla
          INNER JOIN [sys].[schemas] AS esquema
            ON esquema.[schema_id] = tabla.[schema_id]
          WHERE tabla.[name] IN (@objeto0, @objeto1, @objeto2, @objeto3, @objeto4);
        `);

        const encontrados = new Set(resultadoObjetos.recordset.map(({ nombreObjeto }) => nombreObjeto));
        if (objetosRequeridos.every((nombreObjeto) => encontrados.has(nombreObjeto))) {
          basesCandidatas.push(nombreBaseDatos);
        }
      } finally {
        await poolBase.close();
      }
    }

    const privilegios = resultadoPrivilegios.recordset[0];
    console.log(
      JSON.stringify(
        {
          conexionValida: true,
          privilegios: {
            esAdministradorServidor: privilegios?.esAdministradorServidor === 1,
            tieneControlServidor: privilegios?.tieneControlServidor === true,
          },
          basesDisponibles,
          basesCandidatas,
        },
        null,
        2,
      ),
    );
  } finally {
    await poolMaster.close();
  }
}

diagnosticarBaseSistemaOrigen().catch((error: unknown) => {
  const codigo = error instanceof sql.ConnectionError ? 'ERROR_CONEXION_SQL' : 'ERROR_DIAGNOSTICO_SQL';
  console.error(codigo);
  process.exitCode = 1;
});
