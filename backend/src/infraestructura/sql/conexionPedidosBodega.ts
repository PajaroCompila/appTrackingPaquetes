import type sql from 'mssql';
import { ErrorDependenciaDatos } from '../../compartido/errores/errorDependenciaDatos.js';
import { obtenerConfiguracionPedidosBodega } from '../../configuracion/configuracionBaseDatos.js';
import { crearPoolSql } from './crearPoolSql.js';

let poolPedidosBodega: sql.ConnectionPool | undefined;

export async function inicializarConexionPedidosBodega(): Promise<void> {
  if (poolPedidosBodega?.connected) return;
  const configuracion = obtenerConfiguracionPedidosBodega();
  const nuevoPool = crearPoolSql(configuracion, 'Pedidos Bodega - datos propios', false);
  await nuevoPool.connect();
  poolPedidosBodega = nuevoPool;
}

export function obtenerPoolPedidosBodega(): sql.ConnectionPool {
  if (!poolPedidosBodega?.connected) throw new ErrorDependenciaDatos();
  return poolPedidosBodega;
}

export async function cerrarConexionPedidosBodega(): Promise<void> {
  if (!poolPedidosBodega) return;
  const poolActual = poolPedidosBodega;
  poolPedidosBodega = undefined;
  await poolActual.close();
}
