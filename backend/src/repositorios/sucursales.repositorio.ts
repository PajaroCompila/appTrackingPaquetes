import sql from "mssql";
import type { Configuracion } from "../configuracion/entorno.js";
import { obtenerConexion } from "../baseDatos/conexion.js";
import type { Ciudad, Departamento, Sucursal } from "../modelos/usuario.js";

export interface DatosSucursal { nombre: string; codigo: string; direccion: string; departamentoCodigo: string; ciudadCodigo: string; telefono: string; }
export interface CatalogoUbicaciones { departamentos: Departamento[]; ciudades: Ciudad[]; }
export interface RepositorioSucursales {
  listar(): Promise<Sucursal[]>;
  listarUbicaciones(): Promise<CatalogoUbicaciones>;
  ubicacionValida(departamentoCodigo: string, ciudadCodigo: string): Promise<boolean>;
  buscarPorCodigo(codigo: string): Promise<Sucursal | null>;
  crear(datos: DatosSucursal): Promise<Sucursal>;
  actualizar(sucursalId: number, datos: DatosSucursal): Promise<Sucursal | null>;
}

const consultaSucursal = `SELECT s.sucursalId, s.nombre, s.codigo, s.direccion, s.departamentoCodigo,
  d.nombre AS departamento, s.ciudadCodigo, c.nombre AS ciudad, s.telefono, s.activo, s.fechaCreacion
  FROM dbo.Sucursales s INNER JOIN dbo.Departamentos d ON d.codigo = s.departamentoCodigo
  INNER JOIN dbo.Ciudades c ON c.codigo = s.ciudadCodigo`;

export class RepositorioSucursalesSql implements RepositorioSucursales {
  constructor(private readonly configuracion: Configuracion) {}
  async listar(): Promise<Sucursal[]> {
    const conexion = await obtenerConexion(this.configuracion);
    return (await conexion.request().query<Sucursal>(`${consultaSucursal} ORDER BY s.nombre`)).recordset;
  }
  async listarUbicaciones(): Promise<CatalogoUbicaciones> {
    const conexion = await obtenerConexion(this.configuracion);
    const departamentos = await conexion.request().query<Departamento>("SELECT codigo, nombre, cabecera FROM dbo.Departamentos ORDER BY codigo");
    const ciudades = await conexion.request().query<Ciudad>("SELECT codigo, departamentoCodigo, nombre FROM dbo.Ciudades ORDER BY departamentoCodigo, nombre");
    return { departamentos: departamentos.recordset, ciudades: ciudades.recordset };
  }
  async ubicacionValida(departamentoCodigo: string, ciudadCodigo: string): Promise<boolean> {
    const conexion = await obtenerConexion(this.configuracion);
    const resultado = await conexion.request().input("departamentoCodigo", sql.Char(2), departamentoCodigo)
      .input("ciudadCodigo", sql.Char(4), ciudadCodigo)
      .query("SELECT TOP 1 1 AS existe FROM dbo.Ciudades WHERE codigo = @ciudadCodigo AND departamentoCodigo = @departamentoCodigo");
    return resultado.recordset.length > 0;
  }
  async buscarPorCodigo(codigo: string): Promise<Sucursal | null> {
    const conexion = await obtenerConexion(this.configuracion);
    const resultado = await conexion.request().input("codigo", sql.VarChar(20), codigo).query<Sucursal>(`${consultaSucursal} WHERE s.codigo = @codigo`);
    return resultado.recordset[0] ?? null;
  }
  async crear(datos: DatosSucursal): Promise<Sucursal> {
    const conexion = await obtenerConexion(this.configuracion);
    const resultado = await this.solicitud(conexion.request(), datos).query<Sucursal>(`DECLARE @id INT;
      INSERT INTO dbo.Sucursales (nombre, codigo, direccion, ciudad, telefono, departamentoCodigo, ciudadCodigo)
      SELECT @nombre, @codigo, @direccion, c.nombre, @telefono, @departamentoCodigo, @ciudadCodigo FROM dbo.Ciudades c
      WHERE c.codigo = @ciudadCodigo AND c.departamentoCodigo = @departamentoCodigo;
      SET @id = SCOPE_IDENTITY(); ${consultaSucursal} WHERE s.sucursalId = @id;`);
    const creada = resultado.recordset[0];
    if (!creada) throw new Error("No se obtuvo la sucursal creada");
    return creada;
  }
  async actualizar(sucursalId: number, datos: DatosSucursal): Promise<Sucursal | null> {
    const conexion = await obtenerConexion(this.configuracion);
    const resultado = await this.solicitud(conexion.request().input("sucursalId", sql.Int, sucursalId), datos).query<Sucursal>(`
      UPDATE s SET nombre=@nombre, codigo=@codigo, direccion=@direccion, ciudad=c.nombre, telefono=@telefono,
      departamentoCodigo=@departamentoCodigo, ciudadCodigo=@ciudadCodigo FROM dbo.Sucursales s INNER JOIN dbo.Ciudades c
      ON c.codigo=@ciudadCodigo AND c.departamentoCodigo=@departamentoCodigo WHERE s.sucursalId=@sucursalId;
      ${consultaSucursal} WHERE s.sucursalId=@sucursalId;`);
    return resultado.recordset[0] ?? null;
  }
  private solicitud(solicitud: sql.Request, datos: DatosSucursal): sql.Request {
    return solicitud.input("nombre", sql.NVarChar(100), datos.nombre).input("codigo", sql.VarChar(20), datos.codigo)
      .input("direccion", sql.NVarChar(200), datos.direccion).input("departamentoCodigo", sql.Char(2), datos.departamentoCodigo)
      .input("ciudadCodigo", sql.Char(4), datos.ciudadCodigo).input("telefono", sql.VarChar(30), datos.telefono);
  }
}
