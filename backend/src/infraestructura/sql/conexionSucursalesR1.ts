import type sql from 'mssql';
import { obtenerConfiguracionesSucursalesR1, type ConfiguracionSucursalR1 } from
  '../../configuracion/configuracionBaseDatos.js';
import { crearPoolSql } from './crearPoolSql.js';

const pools = new Map<string, sql.ConnectionPool>();
const reintentarDespues = new Map<string, number>();

export function obtenerSucursalesR1(): ConfiguracionSucursalR1[] {
  return obtenerConfiguracionesSucursalesR1();
}

export async function obtenerPoolSucursalR1(configuracion: ConfiguracionSucursalR1): Promise<sql.ConnectionPool> {
  const actual = pools.get(configuracion.codigoTienda);
  if (actual?.connected) return actual;
  if ((reintentarDespues.get(configuracion.codigoTienda) ?? 0) > Date.now()) {
    throw new Error('La sucursal no está disponible temporalmente.');
  }
  if (actual) await actual.close().catch(() => undefined);
  const nuevo = crearPoolSql(configuracion,
    `Pedidos Bodega - R1 ${configuracion.codigoTienda} lectura`, true);
  try {
    await nuevo.connect();
    reintentarDespues.delete(configuracion.codigoTienda);
  } catch (error) {
    reintentarDespues.set(configuracion.codigoTienda, Date.now() + 30_000);
    await nuevo.close().catch(() => undefined);
    throw error;
  }
  pools.set(configuracion.codigoTienda, nuevo);
  return nuevo;
}

export async function cerrarConexionesSucursalesR1(): Promise<void> {
  const actuales = [...pools.values()];
  pools.clear();
  reintentarDespues.clear();
  await Promise.all(actuales.map((pool) => pool.close().catch(() => undefined)));
}
