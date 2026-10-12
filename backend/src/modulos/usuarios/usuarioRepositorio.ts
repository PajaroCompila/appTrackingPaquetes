import sql from 'mssql';
import { obtenerPoolPedidosBodega } from '../../infraestructura/sql/conexionPedidosBodega.js';

export interface UsuarioAdministrable { usuarioId:string; nombreCompleto:string; nombreUsuario:string;
  correo:string|null; codigoRol:string; nombreRol:string; activo:boolean; debeCambiarContrasena:boolean;
  ultimoAcceso:string|null; creadoEn:string; actualizadoEn:string; codigosAlmacenVisibles:string[] }
export interface DatosUsuario { nombreCompleto:string; nombreUsuario:string; correo?:string;
  codigoRol:string; activo?:boolean }
interface FilaUsuario { usuarioId:string;nombreCompleto:string;nombreUsuario:string;correo:string|null;
  codigoRol:string;nombreRol:string;activo:boolean;debeCambiarContrasena:boolean;ultimoAcceso:Date|null;
  creadoEn:Date;actualizadoEn:Date;almacenesVisibles:string|null;total?:number }

export class UsuarioRepositorio {
  public async listar(f:{busqueda?:string;rol?:string;activo?:string;pagina:number;cantidadPorPagina:number}) {
    const inicio=(f.pagina-1)*f.cantidadPorPagina;
    const r=await obtenerPoolPedidosBodega().request().input('busqueda',sql.NVarChar(150),f.busqueda?`%${f.busqueda}%`:null)
      .input('rol',sql.NVarChar(40),f.rol??null).input('activo',sql.Bit,f.activo===undefined?null:f.activo==='true')
      .input('inicio',sql.Int,inicio).input('cantidad',sql.Int,f.cantidadPorPagina).query<FilaUsuario>(`
      SELECT u.idUsuario usuarioId,u.nombreCompleto,u.nombreUsuario,u.correo,r.codigo codigoRol,
        r.nombre nombreRol,u.activo,u.debeCambiarContrasena,u.ultimoAcceso,u.creadoEn,u.actualizadoEn,
        (SELECT STRING_AGG(acceso.codigoAlmacen,N',') WITHIN GROUP (ORDER BY acceso.codigoAlmacen)
          FROM dbo.UsuarioAlmacenVisible acceso WHERE acceso.idUsuario=u.idUsuario) almacenesVisibles,
        COUNT(*) OVER() total
      FROM dbo.UsuarioAplicacion u JOIN dbo.RolAplicacion r ON r.idRol=u.rolId
      WHERE (@busqueda IS NULL OR u.nombreCompleto LIKE @busqueda OR u.nombreUsuario LIKE @busqueda OR u.correo LIKE @busqueda)
        AND (@rol IS NULL OR r.codigo=@rol) AND (@activo IS NULL OR u.activo=@activo)
      ORDER BY u.nombreCompleto,u.nombreUsuario OFFSET @inicio ROWS FETCH NEXT @cantidad ROWS ONLY;`);
    return {usuarios:r.recordset.map(this.mapear),total:Number(r.recordset[0]?.total??0)};
  }
  public async obtener(id:string):Promise<UsuarioAdministrable|null>{const r=await obtenerPoolPedidosBodega().request()
    .input('id',sql.UniqueIdentifier,id).query<FilaUsuario>(`SELECT u.idUsuario usuarioId,u.nombreCompleto,u.nombreUsuario,u.correo,
      r.codigo codigoRol,r.nombre nombreRol,u.activo,u.debeCambiarContrasena,u.ultimoAcceso,u.creadoEn,u.actualizadoEn,
      (SELECT STRING_AGG(acceso.codigoAlmacen,N',') WITHIN GROUP (ORDER BY acceso.codigoAlmacen)
        FROM dbo.UsuarioAlmacenVisible acceso WHERE acceso.idUsuario=u.idUsuario) almacenesVisibles
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
      SET XACT_ABORT ON;
      BEGIN TRANSACTION;
      DECLARE @rolAnterior uniqueidentifier=(SELECT rolId FROM dbo.UsuarioAplicacion WITH (UPDLOCK) WHERE idUsuario=@id);
      DECLARE @rolId uniqueidentifier=(SELECT idRol FROM dbo.RolAplicacion WHERE codigo=@rol AND activo=1);
      IF @rolId IS NULL THROW 51001,'ROL_NO_ENCONTRADO',1;
      UPDATE dbo.UsuarioAplicacion SET nombreCompleto=@nombreCompleto,nombreVisible=@nombreCompleto,
        nombreUsuario=@nombreUsuario,correo=@correo,rolId=@rolId,codigoRol=@rol,actualizadoEn=SYSUTCDATETIME()
      WHERE idUsuario=@id;
      IF @rolAnterior <> @rolId
        UPDATE dbo.SesionAutenticada SET revocadaEn=COALESCE(revocadaEn,SYSUTCDATETIME()) WHERE idUsuario=@id;
      COMMIT TRANSACTION;`);return this.obtener(id);}
  public async contarAdministradoresActivos(){const r=await obtenerPoolPedidosBodega().request().query<{cantidad:number}>(`
    SELECT COUNT(*) cantidad FROM dbo.UsuarioAplicacion u JOIN dbo.RolAplicacion r ON r.idRol=u.rolId
    WHERE u.activo=1 AND r.codigo=N'ADMINISTRADOR';`);return Number(r.recordset[0]?.cantidad??0);}
  public async cambiarEstado(id:string,activo:boolean){await obtenerPoolPedidosBodega().request().input('id',sql.UniqueIdentifier,id)
    .input('activo',sql.Bit,activo).query(`UPDATE dbo.UsuarioAplicacion SET activo=@activo,actualizadoEn=SYSUTCDATETIME() WHERE idUsuario=@id;
      IF @activo=0 UPDATE dbo.SesionAutenticada SET revocadaEn=COALESCE(revocadaEn,SYSUTCDATETIME()) WHERE idUsuario=@id;`);}
  public async eliminarLogicamente(id:string):Promise<void>{await obtenerPoolPedidosBodega().request()
    .input('id',sql.UniqueIdentifier,id).query(`
      SET XACT_ABORT ON;
      BEGIN TRANSACTION;
      DECLARE @nombreUsuario nvarchar(100), @codigoRol nvarchar(40), @activo bit;
      SELECT @nombreUsuario=u.nombreUsuario,@codigoRol=r.codigo,@activo=u.activo
      FROM dbo.UsuarioAplicacion u WITH (UPDLOCK,HOLDLOCK)
      JOIN dbo.RolAplicacion r ON r.idRol=u.rolId
      WHERE u.idUsuario=@id;
      IF @nombreUsuario IS NULL THROW 51004,'USUARIO_NO_ENCONTRADO',1;
      IF @activo=1 AND @codigoRol=N'ADMINISTRADOR' AND
        (SELECT COUNT(*) FROM dbo.UsuarioAplicacion administrador WITH (UPDLOCK,HOLDLOCK)
          JOIN dbo.RolAplicacion rol ON rol.idRol=administrador.rolId
          WHERE administrador.activo=1 AND rol.codigo=N'ADMINISTRADOR')<=1
        THROW 51002,'ULTIMO_ADMINISTRADOR',1;
      IF @activo=1 AND EXISTS(
        SELECT 1
        FROM dbo.AsignacionArticuloPedido asignacion
        JOIN dbo.SeguimientoPedidoDetalle detalle
          ON detalle.idOrigen=asignacion.idOrigen
         AND detalle.identificadorDetalle=asignacion.identificadorDetalle
         AND detalle.activo=1
        LEFT JOIN dbo.PedidoDespachado despacho ON despacho.idOrigen=asignacion.idOrigen
        WHERE asignacion.usuarioAsignado=@nombreUsuario
          AND (despacho.idPedidoDespachado IS NULL OR (
            despacho.estadoLocal IN ('DESPACHADO','CERRADO')
            AND despacho.validadoDetectadoEn IS NULL
            AND despacho.entregaDetectadaEn IS NULL
            AND NOT EXISTS(SELECT 1 FROM dbo.RecepcionDevolucionPedido recepcion
              WHERE recepcion.idPedidoDespachado=despacho.idPedidoDespachado)
            AND NOT EXISTS(SELECT 1 FROM dbo.DevolucionPedido devolucion
              WHERE devolucion.idPedidoDespachado=despacho.idPedidoDespachado
                AND devolucion.estado=N'DEVUELTO')))
      ) THROW 51003,'ASIGNACIONES_ACTIVAS',1;
      UPDATE dbo.UsuarioAplicacion SET activo=0,actualizadoEn=SYSUTCDATETIME()
        WHERE idUsuario=@id AND activo=1;
      UPDATE dbo.SesionAutenticada SET revocadaEn=COALESCE(revocadaEn,SYSUTCDATETIME())
        WHERE idUsuario=@id AND revocadaEn IS NULL;
      COMMIT TRANSACTION;`);}
  public async restablecer(id:string,hash:Buffer){await obtenerPoolPedidosBodega().request().input('id',sql.UniqueIdentifier,id)
    .input('hash',sql.VarBinary(256),hash).query(`UPDATE dbo.UsuarioAplicacion SET hashContrasena=@hash,
      algoritmoContrasena=N'argon2id',debeCambiarContrasena=1,intentosFallidos=0,bloqueadoHasta=NULL,
      actualizadoEn=SYSUTCDATETIME() WHERE idUsuario=@id;
      UPDATE dbo.SesionAutenticada SET revocadaEn=COALESCE(revocadaEn,SYSUTCDATETIME()) WHERE idUsuario=@id;`);}
  public async roles(){const r=await obtenerPoolPedidosBodega().request().query(`SELECT idRol rolId,codigo,nombre,descripcion,activo
    FROM dbo.RolAplicacion WHERE activo=1 ORDER BY CASE codigo WHEN 'ADMINISTRADOR' THEN 1 WHEN 'OPERADOR_BODEGA' THEN 2 ELSE 3 END;`);return r.recordset;}
  public async guardarAlmacenes(id:string,codigos:string[]):Promise<void>{
    const pool=obtenerPoolPedidosBodega();const transaccion=new sql.Transaction(pool);await transaccion.begin();
    try{await new sql.Request(transaccion).input('id',sql.UniqueIdentifier,id)
      .query('DELETE dbo.UsuarioAlmacenVisible WHERE idUsuario=@id;');
      for(const codigo of codigos){await new sql.Request(transaccion).input('id',sql.UniqueIdentifier,id)
        .input('codigo',sql.NVarChar(16),codigo).query(`INSERT dbo.UsuarioAlmacenVisible(idUsuario,codigoAlmacen)
          VALUES(@id,@codigo);`);}await transaccion.commit();
    }catch(error){await transaccion.rollback();throw error;}}
  private mapear(f:FilaUsuario):UsuarioAdministrable{return{usuarioId:f.usuarioId,nombreCompleto:f.nombreCompleto,nombreUsuario:f.nombreUsuario,
    correo:f.correo,codigoRol:f.codigoRol,nombreRol:f.nombreRol,activo:Boolean(f.activo),debeCambiarContrasena:Boolean(f.debeCambiarContrasena),
    ultimoAcceso:f.ultimoAcceso?.toISOString()??null,creadoEn:f.creadoEn.toISOString(),actualizadoEn:f.actualizadoEn.toISOString(),
    codigosAlmacenVisibles:f.almacenesVisibles?.split(',').filter(Boolean)??[]};}
}
