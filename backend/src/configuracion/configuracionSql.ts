import 'dotenv/config';
import { z } from 'zod';

const esquemaConfiguracionSql = z.object({
  SQL_SERVIDOR: z.string().trim().min(1),
  SQL_PUERTO: z.coerce.number().int().min(1).max(65535).default(1433),
  SQL_BASE_DATOS: z.string().trim().min(1),
  SQL_USUARIO: z.string().trim().min(1),
  SQL_CONTRASENA: z.string().min(1),
  SQL_CIFRAR: z.stringbool().default(false),
  SQL_CONFIAR_CERTIFICADO: z.stringbool().default(false),
  SQL_TIEMPO_ESPERA_CONEXION_MS: z.coerce.number().int().min(1000).max(30000).default(5000),
  SQL_TIEMPO_MAXIMO_CONSULTA_MS: z.coerce.number().int().min(1000).max(30000).default(10000),
  SQL_POOL_MINIMO: z.coerce.number().int().min(0).max(5).default(0),
  SQL_POOL_MAXIMO: z.coerce.number().int().min(1).max(20).default(5),
});

export interface ConfiguracionSql {
  servidor: string;
  puerto: number;
  baseDatos: string;
  usuario: string;
  contrasena: string;
  cifrar: boolean;
  confiarCertificado: boolean;
  tiempoEsperaConexionMs: number;
  tiempoMaximoConsultaMs: number;
  poolMinimo: number;
  poolMaximo: number;
}

export function obtenerConfiguracionSql(
  variablesEntorno: NodeJS.ProcessEnv = process.env,
): ConfiguracionSql {
  const resultado = esquemaConfiguracionSql.safeParse(variablesEntorno);

  if (!resultado.success || resultado.data.SQL_POOL_MINIMO > resultado.data.SQL_POOL_MAXIMO) {
    throw new Error('La configuración SQL de SistemaOrigen no es válida o está incompleta.');
  }

  return {
    servidor: resultado.data.SQL_SERVIDOR,
    puerto: resultado.data.SQL_PUERTO,
    baseDatos: resultado.data.SQL_BASE_DATOS,
    usuario: resultado.data.SQL_USUARIO,
    contrasena: resultado.data.SQL_CONTRASENA,
    cifrar: resultado.data.SQL_CIFRAR,
    confiarCertificado: resultado.data.SQL_CONFIAR_CERTIFICADO,
    tiempoEsperaConexionMs: resultado.data.SQL_TIEMPO_ESPERA_CONEXION_MS,
    tiempoMaximoConsultaMs: resultado.data.SQL_TIEMPO_MAXIMO_CONSULTA_MS,
    poolMinimo: resultado.data.SQL_POOL_MINIMO,
    poolMaximo: resultado.data.SQL_POOL_MAXIMO,
  };
}
