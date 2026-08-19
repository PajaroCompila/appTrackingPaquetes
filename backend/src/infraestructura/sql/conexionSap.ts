import type sql from 'mssql';
import { obtenerConfiguracionSap } from '../../configuracion/configuracionBaseDatos.js';
import { crearPoolSql } from './crearPoolSql.js';

let poolSap: sql.ConnectionPool | undefined;

export async function obtenerPoolSap(): Promise<sql.ConnectionPool> {
  if (poolSap?.connected) return poolSap;
  const nuevoPool = crearPoolSql(obtenerConfiguracionSap(), 'Pedidos Bodega - SAP lectura', true);
  await nuevoPool.connect();
  poolSap = nuevoPool;
  return nuevoPool;
}

export async function cerrarConexionSap(): Promise<void> {
  const poolActual = poolSap;
  poolSap = undefined;
  if (poolActual) await poolActual.close();
}
