import { z } from 'zod';
import type { ConfiguracionSql } from './configuracionSql.js';

const servidorAutorizado = '192.168.10.150';
const baseAplicacionAutorizada = 'PedidosBodega';
const servidorSapAutorizado = '192.168.10.140';
const baseSapAutorizada = 'PAJARO_AZUL';

function esquemaConexion(prefijo: 'SISTEMA_ORIGEN' | 'PEDIDOS_BODEGA') {
  return z.object({
    [`${prefijo}_SQL_SERVIDOR`]: z.string().trim().min(1),
    [`${prefijo}_SQL_PUERTO`]: z.coerce.number().int().min(1).max(65535).default(1433),
    [`${prefijo}_SQL_BASE_DATOS`]: z.string().trim().min(1),
    [`${prefijo}_SQL_USUARIO`]: z.string().trim().min(1),
    [`${prefijo}_SQL_CONTRASENA`]: z.string().min(1),
    [`${prefijo}_SQL_CIFRAR`]: z.stringbool().default(false),
    [`${prefijo}_SQL_CONFIAR_CERTIFICADO`]: z.stringbool().default(false),
    [`${prefijo}_SQL_TIEMPO_ESPERA_CONEXION_MS`]: z.coerce.number().int().min(1000).max(30000).default(5000),
    [`${prefijo}_SQL_TIEMPO_MAXIMO_CONSULTA_MS`]: z.coerce.number().int().min(1000).max(30000).default(10000),
    [`${prefijo}_SQL_POOL_MINIMO`]: z.coerce.number().int().min(0).max(5).default(0),
    [`${prefijo}_SQL_POOL_MAXIMO`]: z.coerce.number().int().min(1).max(20).default(5),
  });
}

function obtenerConexion(
  prefijo: 'SISTEMA_ORIGEN' | 'PEDIDOS_BODEGA',
  variablesEntorno: NodeJS.ProcessEnv,
): ConfiguracionSql {
  const resultado = esquemaConexion(prefijo).safeParse(variablesEntorno);
  if (!resultado.success) {
    throw new Error(`La configuración SQL de ${prefijo} no es válida o está incompleta.`);
  }

  const datos = resultado.data as Record<string, unknown>;
  const poolMinimo = Number(datos[`${prefijo}_SQL_POOL_MINIMO`]);
  const poolMaximo = Number(datos[`${prefijo}_SQL_POOL_MAXIMO`]);
  if (poolMinimo > poolMaximo) {
    throw new Error(`La configuración SQL de ${prefijo} no es válida o está incompleta.`);
  }

  return {
    servidor: String(datos[`${prefijo}_SQL_SERVIDOR`]),
    puerto: Number(datos[`${prefijo}_SQL_PUERTO`]),
    baseDatos: String(datos[`${prefijo}_SQL_BASE_DATOS`]),
    usuario: String(datos[`${prefijo}_SQL_USUARIO`]),
    contrasena: String(datos[`${prefijo}_SQL_CONTRASENA`]),
    cifrar: Boolean(datos[`${prefijo}_SQL_CIFRAR`]),
    confiarCertificado: Boolean(datos[`${prefijo}_SQL_CONFIAR_CERTIFICADO`]),
    tiempoEsperaConexionMs: Number(datos[`${prefijo}_SQL_TIEMPO_ESPERA_CONEXION_MS`]),
    tiempoMaximoConsultaMs: Number(datos[`${prefijo}_SQL_TIEMPO_MAXIMO_CONSULTA_MS`]),
    poolMinimo,
    poolMaximo,
  };
}

export function obtenerConfiguracionSistemaOrigen(
  variablesEntorno: NodeJS.ProcessEnv = process.env,
): ConfiguracionSql {
  const configuracion = obtenerConexion('SISTEMA_ORIGEN', variablesEntorno);
  if (
    configuracion.servidor !== servidorAutorizado ||
    ['master', baseAplicacionAutorizada.toLowerCase()].includes(configuracion.baseDatos.toLowerCase())
  ) {
    throw new Error('La conexión de SistemaOrigen debe apuntar a su base autorizada en 192.168.10.150.');
  }
  return configuracion;
}

export interface ConfiguracionSucursalR1 extends ConfiguracionSql {
  codigoTienda: string;
  nombreTienda: string;
}

export function obtenerConfiguracionesSucursalesR1(
  variablesEntorno: NodeJS.ProcessEnv = process.env,
): ConfiguracionSucursalR1[] {
  const comun = obtenerConfiguracionSistemaOrigen(variablesEntorno);
  const sucursales = [
    { codigoTienda: 'TLCB01', nombreTienda: 'La Ceiba', servidor: '192.168.11.1' },
    { codigoTienda: 'TPRO01', nombreTienda: 'El Progreso', servidor: '192.168.13.1' },
    { codigoTienda: 'TCIR01', nombreTienda: 'San Pedro Sula CIR', servidor: '192.168.14.1' },
    { codigoTienda: 'TSPS01', nombreTienda: 'San Pedro Sula Principal', servidor: '192.168.10.150' },
    { codigoTienda: 'TTGU01', nombreTienda: 'Tegucigalpa Palmira', servidor: '192.168.12.1' },
    { codigoTienda: 'TTBM01', nombreTienda: 'Tegucigalpa Bulevar Morazán', servidor: '192.168.15.1' },
  ];
  return sucursales.map((sucursal) => ({ ...comun, ...sucursal, baseDatos: 'Retail One',
    poolMinimo: 0, poolMaximo: Math.min(comun.poolMaximo, 2) }));
}

export function obtenerConfiguracionPedidosBodega(
  variablesEntorno: NodeJS.ProcessEnv = process.env,
): ConfiguracionSql {
  const configuracion = obtenerConexion('PEDIDOS_BODEGA', variablesEntorno);
  if (
    configuracion.servidor !== servidorAutorizado ||
    configuracion.baseDatos !== baseAplicacionAutorizada
  ) {
    throw new Error('La conexión propia debe apuntar exclusivamente a 192.168.10.150/PedidosBodega.');
  }
  return configuracion;
}

export function validarSeparacionConexiones(
  variablesEntorno: NodeJS.ProcessEnv = process.env,
): void {
  obtenerConfiguracionSistemaOrigen(variablesEntorno);
  obtenerConfiguracionPedidosBodega(variablesEntorno);
}

export function obtenerConfiguracionSap(
  variablesEntorno: NodeJS.ProcessEnv = process.env,
): ConfiguracionSql {
  const resultado = z.object({
    SAP_DB_HOST: z.string().trim().min(1),
    SAP_DB_PORT: z.coerce.number().int().min(1).max(65535).default(1433),
    SAP_DB_USER: z.string().trim().min(1),
    SAP_DB_PASSWORD: z.string().min(1),
    SAP_DB_NAME: z.string().trim().min(1),
  }).parse(variablesEntorno);
  if (resultado.SAP_DB_HOST !== servidorSapAutorizado || resultado.SAP_DB_NAME !== baseSapAutorizada) {
    throw new Error('La conexión SAP debe apuntar exclusivamente a 192.168.10.140/PAJARO_AZUL.');
  }
  return {
    servidor: resultado.SAP_DB_HOST, puerto: resultado.SAP_DB_PORT,
    baseDatos: resultado.SAP_DB_NAME, usuario: resultado.SAP_DB_USER,
    contrasena: resultado.SAP_DB_PASSWORD, cifrar: false, confiarCertificado: false,
    tiempoEsperaConexionMs: 5000, tiempoMaximoConsultaMs: 10000,
    poolMinimo: 0, poolMaximo: 5,
  };
}

export { baseAplicacionAutorizada, servidorAutorizado };
