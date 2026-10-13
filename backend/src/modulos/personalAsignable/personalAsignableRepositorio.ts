import sql from 'mssql';
import { obtenerPoolPedidosBodega } from '../../infraestructura/sql/conexionPedidosBodega.js';
import type { AmbitoPersonalAsignable, NuevoPersonalAsignable,
  PersonalAsignable } from './personalAsignable.interface.js';

interface FilaPersonalAsignable {
  idPersonal: string;
  codigoAsignacion: string;
  nombre: string;
  apellido: string;
  nombreCompleto: string;
  ambito: AmbitoPersonalAsignable;
  activo: boolean;
  fechaCreacion: Date;
}

export class PersonalAsignableRepositorio {
  public async listarActivos(ambitos: readonly AmbitoPersonalAsignable[]): Promise<PersonalAsignable[]> {
    if (ambitos.length === 0) return [];
    const resultado = await obtenerPoolPedidosBodega().request()
      .input('ambitos', sql.NVarChar(sql.MAX), JSON.stringify(ambitos))
      .query<FilaPersonalAsignable>(`
        SELECT personal.idPersonal,personal.codigoAsignacion,personal.nombre,personal.apellido,
          personal.nombreCompleto,personal.ambito,personal.activo,personal.fechaCreacion
        FROM dbo.PersonalAsignable personal
        LEFT JOIN dbo.UsuarioAplicacion usuario
          ON usuario.idUsuario=personal.idUsuarioVinculado
        JOIN OPENJSON(@ambitos) WITH (ambito varchar(20) '$') permitido
          ON permitido.ambito=personal.ambito
        WHERE personal.activo=1
          AND (personal.idUsuarioVinculado IS NULL OR usuario.activo=1)
        ORDER BY personal.nombreCompleto COLLATE Modern_Spanish_100_CI_AI,
          personal.codigoAsignacion;`);
    return resultado.recordset.map((fila) => this.mapear(fila));
  }

  public listarTodos(): Promise<PersonalAsignable[]> {
    return this.listarActivos(['GENERAL', 'ACALIX_JLARA', 'TCIR01', 'TTBM01']);
  }

  public async obtenerActivo(
    codigoAsignacion: string,
    ambitos: readonly AmbitoPersonalAsignable[],
  ): Promise<PersonalAsignable | null> {
    if (ambitos.length === 0) return null;
    const resultado = await obtenerPoolPedidosBodega().request()
      .input('codigo', sql.NVarChar(100), codigoAsignacion)
      .input('ambitos', sql.NVarChar(sql.MAX), JSON.stringify(ambitos))
      .query<FilaPersonalAsignable>(`
        SELECT TOP(1) personal.idPersonal,personal.codigoAsignacion,personal.nombre,personal.apellido,
          personal.nombreCompleto,personal.ambito,personal.activo,personal.fechaCreacion
        FROM dbo.PersonalAsignable personal
        LEFT JOIN dbo.UsuarioAplicacion usuario
          ON usuario.idUsuario=personal.idUsuarioVinculado
        JOIN OPENJSON(@ambitos) WITH (ambito varchar(20) '$') permitido
          ON permitido.ambito=personal.ambito
        WHERE personal.codigoAsignacion=@codigo COLLATE Modern_Spanish_100_CI_AI AND personal.activo=1
          AND (personal.idUsuarioVinculado IS NULL OR usuario.activo=1);`);
    return resultado.recordset[0] ? this.mapear(resultado.recordset[0]) : null;
  }

  public async crear(datos: NuevoPersonalAsignable, creadoPor: string): Promise<PersonalAsignable> {
    const resultado = await obtenerPoolPedidosBodega().request()
      .input('nombre', sql.NVarChar(100), datos.nombre)
      .input('apellido', sql.NVarChar(100), datos.apellido)
      .input('creadoPor', sql.UniqueIdentifier, creadoPor)
      .query<FilaPersonalAsignable>(`
        DECLARE @id uniqueidentifier=NEWID();
        DECLARE @codigo nvarchar(100)=CONCAT(N'PERSONAL:',CONVERT(nvarchar(36),@id));
        DECLARE @nombreCompleto nvarchar(205)=CONCAT(@nombre,N' ',@apellido);
        INSERT dbo.PersonalAsignable(
          idPersonal,codigoAsignacion,nombre,apellido,nombreCompleto,ambito,creadoPor)
        VALUES(@id,@codigo,@nombre,@apellido,@nombreCompleto,'GENERAL',@creadoPor);
        SELECT idPersonal,codigoAsignacion,nombre,apellido,nombreCompleto,ambito,activo,fechaCreacion
        FROM dbo.PersonalAsignable WHERE idPersonal=@id;`);
    return this.mapear(resultado.recordset[0]!);
  }

  private mapear(fila: FilaPersonalAsignable): PersonalAsignable {
    return { ...fila, activo: Boolean(fila.activo), fechaCreacion: fila.fechaCreacion.toISOString() };
  }
}
