import sql from 'mssql';
import type { ConfiguracionSql } from '../../configuracion/configuracionSql.js';
import { crearPoolSql } from './crearPoolSql.js';

export function crearPoolSistemaOrigen(configuracionSql: ConfiguracionSql): sql.ConnectionPool {
  return crearPoolSql(configuracionSql, 'Pedidos Bodega - SistemaOrigen lectura', true);
}
