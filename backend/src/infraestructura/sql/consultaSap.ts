import type sql from 'mssql';
import { validarConsultaSistemaOrigen } from './consultaSistemaOrigen.js';
import { obtenerPoolSap } from './conexionSap.js';

export async function consultarSap<T>(
  consulta: string,
  configurar: (solicitud: sql.Request) => sql.Request = (solicitud) => solicitud,
): Promise<sql.IResult<T>> {
  validarConsultaSistemaOrigen(consulta);
  return configurar((await obtenerPoolSap()).request()).query<T>(consulta);
}
