import sql from 'mssql';
import type { ConfiguracionSql } from '../../configuracion/configuracionSql.js';

export function crearPoolSql(
  configuracion: ConfiguracionSql,
  nombreAplicacion: string,
  soloLectura: boolean,
): sql.ConnectionPool {
  return new sql.ConnectionPool({
    server: configuracion.servidor,
    port: configuracion.puerto,
    database: configuracion.baseDatos,
    user: configuracion.usuario,
    password: configuracion.contrasena,
    connectionTimeout: configuracion.tiempoEsperaConexionMs,
    requestTimeout: configuracion.tiempoMaximoConsultaMs,
    pool: {
      min: configuracion.poolMinimo,
      max: configuracion.poolMaximo,
      idleTimeoutMillis: 30000,
    },
    options: {
      appName: nombreAplicacion,
      encrypt: configuracion.cifrar,
      trustServerCertificate: configuracion.confiarCertificado,
      enableArithAbort: true,
      readOnlyIntent: soloLectura,
    },
  });
}
