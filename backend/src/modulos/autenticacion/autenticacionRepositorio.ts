import sql from 'mssql';
import { obtenerPoolPedidosBodega } from '../../infraestructura/sql/conexionPedidosBodega.js';
import type { IdentidadAutenticada, UsuarioAutenticacion } from './autenticacion.interface.js';

export interface IAutenticacionRepositorio {
  buscarUsuario(nombreUsuario: string): Promise<UsuarioAutenticacion | null>;
  crearSesion(usuarioId: string, sesionId: string, expiraEn: Date): Promise<void>;
  obtenerIdentidadSesion(sesionId: string): Promise<IdentidadAutenticada | null>;
  revocarSesion(sesionId: string): Promise<void>;
  registrarIntentoFallido(usuarioId: string): Promise<void>;
  registrarAccesoCorrecto(usuarioId: string): Promise<void>;
  cambiarContrasena(usuarioId: string, hash: Buffer): Promise<void>;
  revocarSesionesUsuario(usuarioId: string, exceptoSesionId?: string): Promise<void>;
}

export class AutenticacionRepositorio implements IAutenticacionRepositorio {
  public async buscarUsuario(nombreUsuario: string): Promise<UsuarioAutenticacion | null> {
    const resultado = await obtenerPoolPedidosBodega().request()
      .input('nombreUsuario', sql.NVarChar(100), nombreUsuario)
      .query<Omit<UsuarioAutenticacion, 'codigosAlmacenVisibles'> & { almacenesVisibles: string | null }>(`
        SELECT usuario.idUsuario AS usuarioId, usuario.nombreUsuario,
               usuario.nombreCompleto AS nombreVisible, usuario.hashContrasena,
               usuario.algoritmoContrasena, rol.codigo AS codigoRol,
               usuario.codigoAlmacen, usuario.activo, usuario.debeCambiarContrasena,
               usuario.intentosFallidos, usuario.bloqueadoHasta,
               (SELECT STRING_AGG(acceso.codigoAlmacen, N',') WITHIN GROUP (ORDER BY acceso.codigoAlmacen)
                FROM dbo.UsuarioAlmacenVisible acceso WHERE acceso.idUsuario = usuario.idUsuario) almacenesVisibles
        FROM dbo.UsuarioAplicacion usuario
        JOIN dbo.RolAplicacion rol ON rol.idRol = usuario.rolId
        WHERE usuario.nombreUsuario = @nombreUsuario;
      `);
    const fila = resultado.recordset[0];
    if (!fila) return null;
    const { almacenesVisibles, ...usuario } = fila;
    return { ...usuario, codigosAlmacenVisibles: almacenesVisibles?.split(',').filter(Boolean) ?? [] };
  }

  public async crearSesion(usuarioId: string, sesionId: string, expiraEn: Date): Promise<void> {
    await obtenerPoolPedidosBodega().request()
      .input('usuarioId', sql.UniqueIdentifier, usuarioId)
      .input('sesionId', sql.UniqueIdentifier, sesionId)
      .input('expiraEn', sql.DateTime2(3), expiraEn)
      .query(`
        INSERT INTO dbo.SesionAutenticada(idSesion, idUsuario, expiraEn)
        VALUES (@sesionId, @usuarioId, @expiraEn);
      `);
  }

  public async obtenerIdentidadSesion(sesionId: string): Promise<IdentidadAutenticada | null> {
    const resultado = await obtenerPoolPedidosBodega().request()
      .input('sesionId', sql.UniqueIdentifier, sesionId)
      .query<Omit<IdentidadAutenticada, 'codigosAlmacenVisibles'> & { almacenesVisibles: string | null }>(`
        SELECT u.idUsuario AS usuarioId, u.nombreUsuario, u.nombreCompleto AS nombreVisible,
               r.codigo AS codigoRol, u.codigoAlmacen, s.idSesion AS sesionId,
               u.debeCambiarContrasena,
               (SELECT STRING_AGG(acceso.codigoAlmacen, N',') WITHIN GROUP (ORDER BY acceso.codigoAlmacen)
                FROM dbo.UsuarioAlmacenVisible acceso WHERE acceso.idUsuario = u.idUsuario) almacenesVisibles
        FROM dbo.SesionAutenticada s
        JOIN dbo.UsuarioAplicacion u ON u.idUsuario = s.idUsuario
        JOIN dbo.RolAplicacion r ON r.idRol = u.rolId AND r.activo = 1
        WHERE s.idSesion = @sesionId
          AND s.revocadaEn IS NULL
          AND s.expiraEn > SYSUTCDATETIME()
          AND u.activo = 1;
      `);
    const fila = resultado.recordset[0];
    if (!fila) return null;
    const { almacenesVisibles, ...identidad } = fila;
    return { ...identidad, codigosAlmacenVisibles: almacenesVisibles?.split(',').filter(Boolean) ?? [] };
  }

  public async revocarSesion(sesionId: string): Promise<void> {
    await obtenerPoolPedidosBodega().request()
      .input('sesionId', sql.UniqueIdentifier, sesionId)
      .query(`
        UPDATE dbo.SesionAutenticada
        SET revocadaEn = COALESCE(revocadaEn, SYSUTCDATETIME())
        WHERE idSesion = @sesionId;
      `);
  }

  public async registrarIntentoFallido(usuarioId: string): Promise<void> {
    await obtenerPoolPedidosBodega().request().input('usuarioId', sql.UniqueIdentifier, usuarioId).query(`
      UPDATE dbo.UsuarioAplicacion SET
        intentosFallidos = intentosFallidos + 1,
        bloqueadoHasta = CASE WHEN intentosFallidos + 1 >= 5
          THEN DATEADD(minute, 15, SYSUTCDATETIME()) ELSE bloqueadoHasta END,
        actualizadoEn = SYSUTCDATETIME()
      WHERE idUsuario = @usuarioId;
    `);
  }

  public async registrarAccesoCorrecto(usuarioId: string): Promise<void> {
    await obtenerPoolPedidosBodega().request().input('usuarioId', sql.UniqueIdentifier, usuarioId).query(`
      UPDATE dbo.UsuarioAplicacion SET intentosFallidos=0, bloqueadoHasta=NULL,
        ultimoAcceso=SYSUTCDATETIME(), actualizadoEn=SYSUTCDATETIME()
      WHERE idUsuario=@usuarioId;
    `);
  }

  public async cambiarContrasena(usuarioId: string, hash: Buffer): Promise<void> {
    await obtenerPoolPedidosBodega().request()
      .input('usuarioId', sql.UniqueIdentifier, usuarioId)
      .input('hash', sql.VarBinary(256), hash).query(`
        UPDATE dbo.UsuarioAplicacion SET hashContrasena=@hash, algoritmoContrasena=N'argon2id',
          debeCambiarContrasena=0, intentosFallidos=0, bloqueadoHasta=NULL,
          actualizadoEn=SYSUTCDATETIME() WHERE idUsuario=@usuarioId;
      `);
  }

  public async revocarSesionesUsuario(usuarioId: string, exceptoSesionId?: string): Promise<void> {
    await obtenerPoolPedidosBodega().request()
      .input('usuarioId', sql.UniqueIdentifier, usuarioId)
      .input('excepto', sql.UniqueIdentifier, exceptoSesionId ?? null).query(`
        UPDATE dbo.SesionAutenticada SET revocadaEn=COALESCE(revocadaEn,SYSUTCDATETIME())
        WHERE idUsuario=@usuarioId AND (@excepto IS NULL OR idSesion<>@excepto) AND revocadaEn IS NULL;
      `);
  }
}
