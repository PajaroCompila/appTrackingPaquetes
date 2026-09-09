import sql from 'mssql';
import { obtenerPoolPedidosBodega } from '../../infraestructura/sql/conexionPedidosBodega.js';
import type {
  AsignacionArticulo,
  IdentidadArticuloAsignacion,
  TecnicoAsignable,
} from './asignacion.interface.js';

type FilaAsignacion = AsignacionArticulo;
type FilaConfirmacionAsignacion = FilaAsignacion & { confirmada: boolean };

export interface ResultadoConfirmacionAsignacion {
  asignacion: AsignacionArticulo;
  confirmada: boolean;
}

export interface ResultadoReasignacion {
  asignacion: AsignacionArticulo;
  actualizada: boolean;
}

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
    tecnico: TecnicoAsignable,
    usuarioId: string,
  ): Promise<ResultadoConfirmacionAsignacion> {
    const solicitud = obtenerPoolPedidosBodega().request()
      .input('idOrigen', sql.NVarChar(150), identidad.idOrigen.trim())
      .input('identificadorDetalle', sql.NVarChar(150), identidad.identificadorDetalle.trim())
      .input('usuarioAsignado', sql.NVarChar(100), tecnico.usuario)
      .input('nombreAsignado', sql.NVarChar(150), tecnico.nombre)
      .input('usuarioId', sql.UniqueIdentifier, usuarioId);
    const resultado = await solicitud.query<FilaConfirmacionAsignacion>(`
      SET XACT_ABORT ON;
      BEGIN TRANSACTION;

      DECLARE @confirmada bit = 0;

      UPDATE dbo.AsignacionArticuloPedido WITH (UPDLOCK, HOLDLOCK)
        SET usuarioAsignado = @usuarioAsignado,
            nombreAsignado = @nombreAsignado,
            asignadoPor = @usuarioId,
            actualizadoEn = SYSUTCDATETIME()
      WHERE idOrigen = @idOrigen
        AND identificadorDetalle = @identificadorDetalle
        AND usuarioAsignado IS NULL;

      IF @@ROWCOUNT = 1
        SET @confirmada = 1;

      IF @confirmada = 0 AND NOT EXISTS(
        SELECT 1
        FROM dbo.AsignacionArticuloPedido WITH (UPDLOCK, HOLDLOCK)
        WHERE idOrigen = @idOrigen AND identificadorDetalle = @identificadorDetalle
      )
      BEGIN
        INSERT dbo.AsignacionArticuloPedido(
          idOrigen, identificadorDetalle, usuarioAsignado, nombreAsignado, asignadoPor
        ) VALUES(
          @idOrigen, @identificadorDetalle, @usuarioAsignado, @nombreAsignado, @usuarioId
        );

        SET @confirmada = 1;
      END;

      SELECT idOrigen, identificadorDetalle, usuarioAsignado, nombreAsignado, actualizadoEn,
        @confirmada confirmada
      FROM dbo.AsignacionArticuloPedido
      WHERE idOrigen = @idOrigen AND identificadorDetalle = @identificadorDetalle;

      COMMIT TRANSACTION;
    `);
    const { confirmada, ...asignacion } = resultado.recordset[0]!;
    return { asignacion, confirmada };
  }

  public async reasignar(
    identidad: IdentidadArticuloAsignacion,
    tecnico: TecnicoAsignable,
    usuarioId: string,
    actualizadoEnEsperado: Date,
  ): Promise<ResultadoReasignacion> {
    const resultado = await obtenerPoolPedidosBodega().request()
      .input('idOrigen', sql.NVarChar(150), identidad.idOrigen.trim())
      .input('identificadorDetalle', sql.NVarChar(150), identidad.identificadorDetalle.trim())
      .input('usuarioAsignado', sql.NVarChar(100), tecnico.usuario)
      .input('nombreAsignado', sql.NVarChar(150), tecnico.nombre)
      .input('usuarioId', sql.UniqueIdentifier, usuarioId)
      .input('actualizadoEnEsperado', sql.DateTime2(7), actualizadoEnEsperado)
      .query<FilaConfirmacionAsignacion>(`
        SET XACT_ABORT ON;
        BEGIN TRANSACTION;

        DECLARE @actualizada bit = 0;
        UPDATE dbo.AsignacionArticuloPedido WITH (UPDLOCK, HOLDLOCK)
          SET usuarioAsignado = @usuarioAsignado,
              nombreAsignado = @nombreAsignado,
              asignadoPor = @usuarioId,
              actualizadoEn = SYSUTCDATETIME()
        WHERE idOrigen = @idOrigen
          AND identificadorDetalle = @identificadorDetalle
          AND actualizadoEn = @actualizadoEnEsperado;

        IF @@ROWCOUNT = 1 SET @actualizada = 1;

        SELECT idOrigen, identificadorDetalle, usuarioAsignado, nombreAsignado, actualizadoEn,
          @actualizada confirmada
        FROM dbo.AsignacionArticuloPedido
        WHERE idOrigen = @idOrigen AND identificadorDetalle = @identificadorDetalle;

        COMMIT TRANSACTION;
      `);
    const fila = resultado.recordset[0];
    if (!fila) {
      return {
        actualizada: false,
        asignacion: { ...identidad, usuarioAsignado: null, nombreAsignado: null, actualizadoEn: null },
      };
    }
    const { confirmada, ...asignacion } = fila;
    return { asignacion, actualizada: confirmada };
  }

}
