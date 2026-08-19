import sql from 'mssql';
import { obtenerPoolPedidosBodega } from '../../infraestructura/sql/conexionPedidosBodega.js';

export interface UsuarioAdministrable { usuarioId:string; nombreCompleto:string; nombreUsuario:string;
  correo:string|null; codigoRol:string; nombreRol:string; activo:boolean; debeCambiarContrasena:boolean;
  ultimoAcceso:string|null; creadoEn:string; actualizadoEn:string }
export interface DatosUsuario { nombreCompleto:string; nombreUsuario:string; correo?:string;
  codigoRol:string; activo?:boolean }
interface FilaUsuario { usuarioId:string;nombreCompleto:string;nombreUsuario:string;correo:string|null;
  codigoRol:string;nombreRol:string;activo:boolean;debeCambiarContrasena:boolean;ultimoAcceso:Date|null;
  creadoEn:Date;actualizadoEn:Date;total?:number }

export class UsuarioRepositorio {
  public async listar(f:{busqueda?:string;rol?:string;activo?:string;pagina:number;cantidadPorPagina:number}) {
    const inicio=(f.pagina-1)*f.cantidadPorPagina;
    const r=await obtenerPoolPedidosBodega().request().input('busqueda',sql.NVarChar(150),f.busqueda?`%${f.busqueda}%`:null)
      .input('rol',sql.NVarChar(40),f.rol??null).input('activo',sql.Bit,f.activo===undefined?null:f.activo==='true')
      .input('inicio',sql.Int,inicio).input('cantidad',sql.Int,f.cantidadPorPagina).query<FilaUsuario>(`
      SELECT u.idUsuario usuarioId,u.nombreCompleto,u.nombreUsuario,u.correo,r.codigo codigoRol,
        r.nombre nombreRol,u.activo,u.debeCambiarContrasena,u.ultimoAcceso,u.creadoEn,u.actualizadoEn,
        COUNT(*) OVER() total
      FROM dbo.UsuarioAplicacion u JOIN dbo.RolAplicacion r ON r.idRol=u.rolId
      WHERE (@busqueda IS NULL OR u.nombreCompleto LIKE @busqueda OR u.nombreUsuario LIKE @busqueda OR u.correo LIKE @busqueda)
        AND (@rol IS NULL OR r.codigo=@rol) AND (@activo IS NULL OR u.activo=@activo)
      ORDER BY u.nombreCompleto,u.nombreUsuario OFFSET @inicio ROWS FETCH NEXT @cantidad ROWS ONLY;`);
    return {usuarios:r.recordset.map(this.mapear),total:Number(r.recordset[0]?.total??0)};
  }
  public async obtener(id:string):Promise<UsuarioAdministrable|null>{const r=await obtenerPoolPedidosBodega().request()
    .input('id',sql.UniqueIdentifier,id).query<FilaUsuario>(`SELECT u.idUsuario usuarioId,u.nombreCompleto,u.nombreUsuario,u.correo,
      r.codigo codigoRol,r.nombre nombreRol,u.activo,u.debeCambiarContrasena,u.ultimoAcceso,u.creadoEn,u.actualizadoEn
      FROM dbo.UsuarioAplicacion u JOIN dbo.RolAplicacion r ON r.idRol=u.rolId WHERE u.idUsuario=@id;`);
    return r.recordset[0]?this.mapear(r.recordset[0]):null;}
  public async crear(d:DatosUsuario,hash:Buffer){const r=await obtenerPoolPedidosBodega().request()
    .input('nombreCompleto',sql.NVarChar(150),d.nombreCompleto).input('nombreUsuario',sql.NVarChar(100),d.nombreUsuario)
    .input('correo',sql.NVarChar(254),d.correo||null).input('rol',sql.NVarChar(40),d.codigoRol)
    .input('hash',sql.VarBinary(256),hash).input('activo',sql.Bit,d.activo??true).query(`
      DECLARE @rolId uniqueidentifier=(SELECT idRol FROM dbo.RolAplicacion WHERE codigo=@rol AND activo=1);
      IF @rolId IS NULL THROW 51001,'ROL_NO_ENCONTRADO',1;
      DECLARE @id uniqueidentifier=NEWID();
      INSERT dbo.UsuarioAplicacion(idUsuario,nombreUsuario,nombreVisible,nombreCompleto,correo,hashContrasena,
        algoritmoContrasena,codigoRol,rolId,activo,debeCambiarContrasena)
      VALUES(@id,@nombreUsuario,@nombreCompleto,@nombreCompleto,@correo,@hash,N'argon2id',@rol,@rolId,@activo,0);
      SELECT @id usuarioId;`);return this.obtener(r.recordset[0].usuarioId);}
  public async editar(id:string,d:DatosUsuario){await obtenerPoolPedidosBodega().request().input('id',sql.UniqueIdentifier,id)
    .input('nombreCompleto',sql.NVarChar(150),d.nombreCompleto).input('nombreUsuario',sql.NVarChar(100),d.nombreUsuario)
    .input('correo',sql.NVarChar(254),d.correo||null).input('rol',sql.NVarChar(40),d.codigoRol).query(`
      DECLARE @rolId uniqueidentifier=(SELECT idRol FROM dbo.RolAplicacion WHERE codigo=@rol AND activo=1);
      IF @rolId IS NULL THROW 51001,'ROL_NO_ENCONTRADO',1;
      UPDATE dbo.UsuarioAplicacion SET nombreCompleto=@nombreCompleto,nombreVisible=@nombreCompleto,
        nombreUsuario=@nombreUsuario,correo=@correo,rolId=@rolId,codigoRol=@rol,actualizadoEn=SYSUTCDATETIME()
      WHERE idUsuario=@id;`);return this.obtener(id);}
  public async contarAdministradoresActivos(){const r=await obtenerPoolPedidosBodega().request().query<{cantidad:number}>(`
    SELECT COUNT(*) cantidad FROM dbo.UsuarioAplicacion u JOIN dbo.RolAplicacion r ON r.idRol=u.rolId
    WHERE u.activo=1 AND r.codigo=N'ADMINISTRADOR';`);return Number(r.recordset[0]?.cantidad??0);}
  public async cambiarEstado(id:string,activo:boolean){await obtenerPoolPedidosBodega().request().input('id',sql.UniqueIdentifier,id)
    .input('activo',sql.Bit,activo).query(`UPDATE dbo.UsuarioAplicacion SET activo=@activo,actualizadoEn=SYSUTCDATETIME() WHERE idUsuario=@id;
      IF @activo=0 UPDATE dbo.SesionAutenticada SET revocadaEn=COALESCE(revocadaEn,SYSUTCDATETIME()) WHERE idUsuario=@id;`);}
  public async restablecer(id:string,hash:Buffer){await obtenerPoolPedidosBodega().request().input('id',sql.UniqueIdentifier,id)
    .input('hash',sql.VarBinary(256),hash).query(`UPDATE dbo.UsuarioAplicacion SET hashContrasena=@hash,
      algoritmoContrasena=N'argon2id',debeCambiarContrasena=1,intentosFallidos=0,bloqueadoHasta=NULL,
      actualizadoEn=SYSUTCDATETIME() WHERE idUsuario=@id;
      UPDATE dbo.SesionAutenticada SET revocadaEn=COALESCE(revocadaEn,SYSUTCDATETIME()) WHERE idUsuario=@id;`);}
  public async roles(){const r=await obtenerPoolPedidosBodega().request().query(`SELECT idRol rolId,codigo,nombre,descripcion,activo
    FROM dbo.RolAplicacion WHERE activo=1 ORDER BY CASE codigo WHEN 'ADMINISTRADOR' THEN 1 WHEN 'OPERADOR_BODEGA' THEN 2 ELSE 3 END;`);return r.recordset;}
  private mapear(f:FilaUsuario):UsuarioAdministrable{return{usuarioId:f.usuarioId,nombreCompleto:f.nombreCompleto,nombreUsuario:f.nombreUsuario,
    correo:f.correo,codigoRol:f.codigoRol,nombreRol:f.nombreRol,activo:Boolean(f.activo),debeCambiarContrasena:Boolean(f.debeCambiarContrasena),
    ultimoAcceso:f.ultimoAcceso?.toISOString()??null,creadoEn:f.creadoEn.toISOString(),actualizadoEn:f.actualizadoEn.toISOString()};}
}
