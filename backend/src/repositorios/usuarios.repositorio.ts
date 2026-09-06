import sql from "mssql";
import type { Configuracion } from "../configuracion/entorno.js";
import { obtenerConexion } from "../baseDatos/conexion.js";
import type {
  CambiosUsuario,
  NuevoUsuario,
  UsuarioGuardado,
} from "../modelos/usuario.js";

export interface RepositorioUsuarios {
  listar(): Promise<UsuarioGuardado[]>;
  buscarPorNombreUsuario(
    nombreUsuario: string,
  ): Promise<UsuarioGuardado | null>;
  buscarPorCorreo(correoElectronico: string): Promise<UsuarioGuardado | null>;
  existeAdministradorActivo(): Promise<boolean>;
  existeSucursalActiva(sucursalId: number): Promise<boolean>;
  obtenerSucursalPrincipal(): Promise<number>;
  crear(usuario: NuevoUsuario): Promise<UsuarioGuardado>;
  actualizar(
    usuarioId: number,
    cambios: CambiosUsuario,
  ): Promise<UsuarioGuardado | null>;
}

export class RepositorioUsuariosSql implements RepositorioUsuarios {
  constructor(private readonly configuracion: Configuracion) {}
  async listar(): Promise<UsuarioGuardado[]> {
    const conexion = await obtenerConexion(this.configuracion);
    const resultado = await conexion.request().query<UsuarioGuardado>(`
      SELECT usuarioId, nombres, apellidos, nombreUsuario, correoElectronico, rol, activo, sucursalId, (SELECT nombre FROM dbo.Sucursales WHERE sucursalId=Usuarios.sucursalId) nombreSucursal,
             contrasenaHash, debeCambiarContrasena, fechaCreacion
      FROM dbo.Usuarios
      ORDER BY fechaCreacion DESC, usuarioId DESC`);
    return resultado.recordset;
  }
  private async consultar(
    campo: "nombreUsuario" | "correoElectronico",
    valor: string,
  ): Promise<UsuarioGuardado | null> {
    const conexion = await obtenerConexion(this.configuracion);
    const resultado = await conexion
      .request()
      .input("valor", sql.NVarChar(160), valor).query<UsuarioGuardado>(`
      SELECT usuarioId, nombres, apellidos, nombreUsuario, correoElectronico, rol, activo, sucursalId, (SELECT nombre FROM dbo.Sucursales WHERE sucursalId=Usuarios.sucursalId) nombreSucursal,
             contrasenaHash, debeCambiarContrasena, fechaCreacion
      FROM dbo.Usuarios WHERE ${campo} = @valor`);
    return resultado.recordset[0] ?? null;
  }
  buscarPorNombreUsuario(nombreUsuario: string) {
    return this.consultar("nombreUsuario", nombreUsuario);
  }
  buscarPorCorreo(correoElectronico: string) {
    return this.consultar("correoElectronico", correoElectronico);
  }
  async existeAdministradorActivo(): Promise<boolean> {
    const conexion = await obtenerConexion(this.configuracion);
    const resultado = await conexion
      .request()
      .query<{ cantidad: number }>(
        "SELECT COUNT(1) AS cantidad FROM dbo.Usuarios WHERE rol = 'administrador' AND activo = 1",
      );
    return (resultado.recordset[0]?.cantidad ?? 0) > 0;
  }
  async existeSucursalActiva(sucursalId:number){const c=await obtenerConexion(this.configuracion);const r=await c.request().input('sucursalId',sql.Int,sucursalId).query<{cantidad:number}>(`SELECT COUNT(1) cantidad FROM dbo.Sucursales WHERE sucursalId=@sucursalId AND activo=1`);return (r.recordset[0]?.cantidad??0)>0;}
  async obtenerSucursalPrincipal(){const c=await obtenerConexion(this.configuracion);const r=await c.request().query<{sucursalId:number}>(`SELECT TOP 1 sucursalId FROM dbo.Sucursales WHERE activo=1 ORDER BY CASE WHEN codigo='PRIN' THEN 0 ELSE 1 END,sucursalId`);if(!r.recordset[0])throw new Error('No hay sucursal principal');return r.recordset[0].sucursalId;}
  async crear(usuario: NuevoUsuario): Promise<UsuarioGuardado> {
    const conexion = await obtenerConexion(this.configuracion);
    const solicitud = conexion
      .request()
      .input("nombres", sql.NVarChar(80), usuario.nombres)
      .input("sucursalId", sql.Int, usuario.sucursalId)
      .input("apellidos", sql.NVarChar(80), usuario.apellidos)
      .input("nombreUsuario", sql.NVarChar(40), usuario.nombreUsuario)
      .input("correoElectronico", sql.NVarChar(160), usuario.correoElectronico)
      .input("rol", sql.VarChar(20), usuario.rol)
      .input("contrasenaHash", sql.NVarChar(255), usuario.contrasenaHash);
    const resultado = await solicitud.query<UsuarioGuardado>(`
      INSERT INTO dbo.Usuarios (nombres, apellidos, nombreUsuario, correoElectronico, rol, contrasenaHash, sucursalId)
      VALUES (@nombres, @apellidos, @nombreUsuario, @correoElectronico, @rol, @contrasenaHash, @sucursalId);
      DECLARE @usuarioCreadoId INT=SCOPE_IDENTITY();
      SELECT u.usuarioId,u.nombres,u.apellidos,u.nombreUsuario,u.correoElectronico,u.rol,u.activo,u.contrasenaHash,u.debeCambiarContrasena,u.fechaCreacion,u.sucursalId,s.nombre nombreSucursal FROM dbo.Usuarios u JOIN dbo.Sucursales s ON s.sucursalId=u.sucursalId WHERE u.usuarioId=@usuarioCreadoId`);
    const creado = resultado.recordset[0];
    if (!creado) throw new Error("No se obtuvo el usuario creado");
    return creado;
  }
  async actualizar(
    usuarioId: number,
    cambios: CambiosUsuario,
  ): Promise<UsuarioGuardado | null> {
    const conexion = await obtenerConexion(this.configuracion);
    const resultado = await conexion
      .request()
      .input("usuarioId", sql.Int, usuarioId)
      .input("sucursalId", sql.Int, cambios.sucursalId)
      .input("nombres", sql.NVarChar(80), cambios.nombres)
      .input("apellidos", sql.NVarChar(80), cambios.apellidos)
      .input("nombreUsuario", sql.NVarChar(40), cambios.nombreUsuario)
      .input("correoElectronico", sql.NVarChar(160), cambios.correoElectronico)
      .input("rol", sql.VarChar(20), cambios.rol)
      .input("activo", sql.Bit, cambios.activo)
      .input(
        "contrasenaHash",
        sql.NVarChar(255),
        cambios.contrasenaHash ?? null,
      ).query<UsuarioGuardado>(`
        UPDATE dbo.Usuarios
        SET nombres = @nombres, apellidos = @apellidos, nombreUsuario = @nombreUsuario,
            correoElectronico = @correoElectronico, rol = @rol, activo = @activo, sucursalId=@sucursalId,
            contrasenaHash = COALESCE(@contrasenaHash, contrasenaHash),
            debeCambiarContrasena = CASE WHEN @contrasenaHash IS NULL THEN debeCambiarContrasena ELSE 1 END
        WHERE usuarioId = @usuarioId;
        SELECT u.usuarioId,u.nombres,u.apellidos,u.nombreUsuario,u.correoElectronico,u.rol,u.activo,u.contrasenaHash,u.debeCambiarContrasena,u.fechaCreacion,u.sucursalId,s.nombre nombreSucursal FROM dbo.Usuarios u JOIN dbo.Sucursales s ON s.sucursalId=u.sucursalId WHERE u.usuarioId=@usuarioId`);
    return resultado.recordset[0] ?? null;
  }
}
