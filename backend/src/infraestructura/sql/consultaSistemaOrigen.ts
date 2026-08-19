import sql from 'mssql';
import { obtenerPoolSistemaOrigen } from './conexionSistemaOrigen.js';

const palabrasProhibidas = /\b(?:INSERT|UPDATE|DELETE|MERGE|INTO|CREATE|ALTER|DROP|TRUNCATE|EXEC|EXECUTE|OPENROWSET|OPENDATASOURCE)\b/i;

export function validarConsultaSistemaOrigen(consulta: string): void {
  const limpia = consulta.trim();
  if (!/^SELECT\b/i.test(limpia)) {
    throw new Error('SistemaOrigen admite únicamente consultas SELECT autorizadas.');
  }
  if (/--|\/\*/.test(limpia)) {
    throw new Error('SistemaOrigen no admite comentarios SQL en consultas operativas.');
  }
  const sinTerminador = limpia.replace(/;\s*$/, '');
  if (sinTerminador.includes(';') || palabrasProhibidas.test(sinTerminador)) {
    throw new Error('La consulta contiene una operación prohibida para SistemaOrigen.');
  }
}

export async function consultarSistemaOrigen<T>(
  consulta: string,
  configurar: (solicitud: sql.Request) => sql.Request = (solicitud) => solicitud,
  proveedorPool: () => sql.ConnectionPool = obtenerPoolSistemaOrigen,
): Promise<sql.IResult<T>> {
  validarConsultaSistemaOrigen(consulta);
  return configurar(proveedorPool().request()).query<T>(consulta);
}
