import sql from 'mssql';
import { obtenerPoolPedidosBodega } from '../../infraestructura/sql/conexionPedidosBodega.js';
import type {
  AsignacionArticulo,
  IdentidadArticuloAsignacion,
  TecnicoAsignable,
} from './asignacion.interface.js';

type FilaAsignacion = AsignacionArticulo;

function lineasUnicas(lineas: IdentidadArticuloAsignacion[]): IdentidadArticuloAsignacion[] {
  const unicas = new Map<string, IdentidadArticuloAsignacion>();
  lineas.forEach((linea) => {
    const normalizada = {
      idOrigen: linea.idOrigen.trim(),
      identificadorDetalle: linea.identificadorDetalle.trim(),
    };
    unicas.set(`${normalizada.idOrigen}\u0000${normalizada.identificadorDetalle}`, normalizada);
  });
  return [...unicas.values()];
}

function agregarLineas(solicitud: sql.Request, lineas: IdentidadArticuloAsignacion[]): string {
  return lineas.map((linea, indice) => {
    solicitud.input(`idOrigen${indice}`, sql.NVarChar(150), linea.idOrigen)
      .input(`detalle${indice}`, sql.NVarChar(150), linea.identificadorDetalle);
    return `(@idOrigen${indice}, @detalle${indice})`;
  }).join(',');
}

export class AsignacionRepositorio {
  public async consultar(lineas: IdentidadArticuloAsignacion[]): Promise<AsignacionArticulo[]> {
    const unicas = lineasUnicas(lineas);
    if (unicas.length === 0) return [];
    const solicitud = obtenerPoolPedidosBodega().request();
    const valores = agregarLineas(solicitud, unicas);
    const resultado = await solicitud.query<FilaAsignacion>(`
      DECLARE @lineas TABLE (
        idOrigen nvarchar(150) NOT NULL,
        identificadorDetalle nvarchar(150) NOT NULL,
        PRIMARY KEY (idOrigen, identificadorDetalle)
      );
      INSERT @lineas(idOrigen, identificadorDetalle) VALUES ${valores};

      SELECT linea.idOrigen, linea.identificadorDetalle,
        asignacion.usuarioAsignado, asignacion.nombreAsignado, asignacion.actualizadoEn
      FROM @lineas linea
      LEFT JOIN dbo.AsignacionArticuloPedido asignacion
        ON asignacion.idOrigen = linea.idOrigen
       AND asignacion.identificadorDetalle = linea.identificadorDetalle;
    `);
    return resultado.recordset;
  }

  public async guardar(
    identidad: IdentidadArticuloAsignacion,
    tecnico: TecnicoAsignable | null,
    usuarioId: string,
  ): Promise<AsignacionArticulo> {
    const solicitud = obtenerPoolPedidosBodega().request()
      .input('idOrigen', sql.NVarChar(150), identidad.idOrigen.trim())
      .input('identificadorDetalle', sql.NVarChar(150), identidad.identificadorDetalle.trim())
      .input('usuarioAsignado', sql.NVarChar(100), tecnico?.usuario ?? null)
      .input('nombreAsignado', sql.NVarChar(150), tecnico?.nombre ?? null)
      .input('usuarioId', sql.UniqueIdentifier, usuarioId);
    const resultado = await solicitud.query<FilaAsignacion>(`
      SET XACT_ABORT ON;
      BEGIN TRANSACTION;

      UPDATE dbo.AsignacionArticuloPedido WITH (UPDLOCK, HOLDLOCK)
        SET usuarioAsignado = @usuarioAsignado,
            nombreAsignado = @nombreAsignado,
            asignadoPor = @usuarioId,
            actualizadoEn = SYSUTCDATETIME()
      WHERE idOrigen = @idOrigen AND identificadorDetalle = @identificadorDetalle;

      IF @@ROWCOUNT = 0
        INSERT dbo.AsignacionArticuloPedido(
          idOrigen, identificadorDetalle, usuarioAsignado, nombreAsignado, asignadoPor
        ) VALUES(
          @idOrigen, @identificadorDetalle, @usuarioAsignado, @nombreAsignado, @usuarioId
        );

      COMMIT TRANSACTION;

      SELECT idOrigen, identificadorDetalle, usuarioAsignado, nombreAsignado, actualizadoEn
      FROM dbo.AsignacionArticuloPedido
      WHERE idOrigen = @idOrigen AND identificadorDetalle = @identificadorDetalle;
    `);
    return resultado.recordset[0]!;
  }

  public async asignarAutomaticamente(
    lineas: IdentidadArticuloAsignacion[],
    tecnico: TecnicoAsignable,
    usuarioId: string,
  ): Promise<AsignacionArticulo[]> {
    const unicas = lineasUnicas(lineas);
    if (unicas.length === 0) return [];
    const solicitud = obtenerPoolPedidosBodega().request()
      .input('usuarioAsignado', sql.NVarChar(100), tecnico.usuario)
      .input('nombreAsignado', sql.NVarChar(150), tecnico.nombre)
      .input('usuarioId', sql.UniqueIdentifier, usuarioId);
    const valores = agregarLineas(solicitud, unicas);
    const resultado = await solicitud.query<FilaAsignacion>(`
      SET XACT_ABORT ON;
      BEGIN TRANSACTION;

      DECLARE @lineas TABLE (
        idOrigen nvarchar(150) NOT NULL,
        identificadorDetalle nvarchar(150) NOT NULL,
        PRIMARY KEY (idOrigen, identificadorDetalle)
      );
      INSERT @lineas(idOrigen, identificadorDetalle) VALUES ${valores};

      UPDATE asignacion WITH (UPDLOCK, HOLDLOCK)
        SET usuarioAsignado = @usuarioAsignado,
            nombreAsignado = @nombreAsignado,
            asignadoPor = @usuarioId,
            actualizadoEn = SYSUTCDATETIME()
      FROM dbo.AsignacionArticuloPedido asignacion
      INNER JOIN @lineas linea
        ON linea.idOrigen = asignacion.idOrigen
       AND linea.identificadorDetalle = asignacion.identificadorDetalle
      WHERE asignacion.usuarioAsignado IS NULL;

      INSERT dbo.AsignacionArticuloPedido(
        idOrigen, identificadorDetalle, usuarioAsignado, nombreAsignado, asignadoPor
      )
      SELECT linea.idOrigen, linea.identificadorDetalle,
        @usuarioAsignado, @nombreAsignado, @usuarioId
      FROM @lineas linea
      WHERE NOT EXISTS (
        SELECT 1
        FROM dbo.AsignacionArticuloPedido asignacion WITH (UPDLOCK, HOLDLOCK)
        WHERE asignacion.idOrigen = linea.idOrigen
          AND asignacion.identificadorDetalle = linea.identificadorDetalle
      );

      SELECT linea.idOrigen, linea.identificadorDetalle,
        asignacion.usuarioAsignado, asignacion.nombreAsignado, asignacion.actualizadoEn
      FROM @lineas linea
      INNER JOIN dbo.AsignacionArticuloPedido asignacion
        ON asignacion.idOrigen = linea.idOrigen
       AND asignacion.identificadorDetalle = linea.identificadorDetalle;

      COMMIT TRANSACTION;
    `);
    return resultado.recordset;
  }
}
