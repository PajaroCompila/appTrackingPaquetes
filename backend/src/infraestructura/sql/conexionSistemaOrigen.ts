import type sql from 'mssql';
import { ErrorDependenciaDatos } from '../../compartido/errores/errorDependenciaDatos.js';
import { obtenerConfiguracionSistemaOrigen } from '../../configuracion/configuracionBaseDatos.js';
import { crearPoolSistemaOrigen } from './crearPoolSistemaOrigen.js';

let poolSistemaOrigen: sql.ConnectionPool | undefined;

export async function inicializarConexionSistemaOrigen(): Promise<void> {
  if (poolSistemaOrigen?.connected) {
    return;
  }

  const nuevoPool = crearPoolSistemaOrigen(obtenerConfiguracionSistemaOrigen());
  await nuevoPool.connect();
  poolSistemaOrigen = nuevoPool;
}

export function obtenerPoolSistemaOrigen(): sql.ConnectionPool {
  if (!poolSistemaOrigen?.connected) {
    throw new ErrorDependenciaDatos();
  }

  return poolSistemaOrigen;
}

export async function cerrarConexionSistemaOrigen(): Promise<void> {
  if (!poolSistemaOrigen) {
    return;
  }

  const poolActual = poolSistemaOrigen;
  poolSistemaOrigen = undefined;
  await poolActual.close();
}
