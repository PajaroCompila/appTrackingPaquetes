import sql from "mssql";
import type { Configuracion } from "../configuracion/entorno.js";
let conexion: sql.ConnectionPool | undefined;
export async function obtenerConexion(
  configuracion: Configuracion,
): Promise<sql.ConnectionPool> {
  if (!conexion)
    conexion = await new sql.ConnectionPool(configuracion.sql).connect();
  return conexion;
}
export async function cerrarConexion(): Promise<void> {
  if (conexion) {
    await conexion.close();
    conexion = undefined;
  }
}
