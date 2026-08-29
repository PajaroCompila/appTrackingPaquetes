import type sql from 'mssql';
import { obtenerConfiguracionSap } from '../../configuracion/configuracionBaseDatos.js';
import { crearPoolSql } from './crearPoolSql.js';

let poolSap: sql.ConnectionPool | undefined;
let reintentarDespues = 0;
const demoraReintentoMs = 30_000;

export async function obtenerPoolSap(): Promise<sql.ConnectionPool> {
  if (poolSap?.connected) return poolSap;
  if (reintentarDespues > Date.now()) {
    throw new Error('SAP no está disponible temporalmente.');
  }
  if (poolSap) await poolSap.close().catch(() => undefined);
  const nuevoPool = crearPoolSql(obtenerConfiguracionSap(), 'Pedidos Bodega - SAP lectura', true);
  try {
    await nuevoPool.connect();
    reintentarDespues = 0;
  } catch (error) {
    reintentarDespues = Date.now() + demoraReintentoMs;
    await nuevoPool.close().catch(() => undefined);
    throw error;
  }
  poolSap = nuevoPool;
  return nuevoPool;
}

export async function cerrarConexionSap(): Promise<void> {
  const poolActual = poolSap;
  poolSap = undefined;
  reintentarDespues = 0;
  if (poolActual) await poolActual.close();
}
