import sql from 'mssql';
import { obtenerPoolPedidosBodega } from '../../infraestructura/sql/conexionPedidosBodega.js';
import type { EstadoImpresionArticulo, IdentidadArticuloImpresion } from './impresion.interface.js';

interface FilaImpresion {
  idOrigen: string;
  identificadorDetalle: string;
  cantidadImpresiones: number;
  ultimaImpresionEn: Date;
}

function prepararLineas(lineas: IdentidadArticuloImpresion[]): IdentidadArticuloImpresion[] {
  const unicas = new Map<string, IdentidadArticuloImpresion>();
  for (const linea of lineas) {
    const normalizada = {
      idOrigen: linea.idOrigen.trim(),
      identificadorDetalle: linea.identificadorDetalle.trim(),
    };
    unicas.set(`${normalizada.idOrigen}\u0000${normalizada.identificadorDetalle}`, normalizada);
  }
  return [...unicas.values()];
}

function agregarLineas(
  solicitud: sql.Request,
  lineas: IdentidadArticuloImpresion[],
): string {
  return lineas.map((linea, indice) => {
    solicitud
      .input(`idOrigen${indice}`, sql.NVarChar(150), linea.idOrigen)
      .input(`detalle${indice}`, sql.NVarChar(150), linea.identificadorDetalle);
    return `(@idOrigen${indice}, @detalle${indice})`;
  }).join(',');
}

export class ImpresionRepositorio {
  public async consultar(lineas: IdentidadArticuloImpresion[]): Promise<EstadoImpresionArticulo[]> {
    const unicas = prepararLineas(lineas);
    if (unicas.length === 0) return [];
    const solicitud = obtenerPoolPedidosBodega().request();
    const valores = agregarLineas(solicitud, unicas);
    const resultado = await solicitud.query<FilaImpresion>(`
      DECLARE @lineas TABLE (
        idOrigen nvarchar(150) NOT NULL,
        identificadorDetalle nvarchar(150) NOT NULL,
        PRIMARY KEY (idOrigen, identificadorDetalle)
      );
      INSERT @lineas(idOrigen, identificadorDetalle) VALUES ${valores};

      SELECT impresion.idOrigen, impresion.identificadorDetalle,
        impresion.cantidadImpresiones, impresion.ultimaImpresionEn
      FROM dbo.ImpresionArticulo impresion
      INNER JOIN @lineas linea
        ON linea.idOrigen = impresion.idOrigen
       AND linea.identificadorDetalle = impresion.identificadorDetalle;
    `);
    return resultado.recordset;
  }

  public async registrar(
    lineas: IdentidadArticuloImpresion[],
    usuarioId: string,
  ): Promise<EstadoImpresionArticulo[]> {
    const unicas = prepararLineas(lineas);
    if (unicas.length === 0) return [];
    const solicitud = obtenerPoolPedidosBodega().request()
      .input('usuarioId', sql.UniqueIdentifier, usuarioId);
    const valores = agregarLineas(solicitud, unicas);
    const resultado = await solicitud.query<FilaImpresion>(`
      SET XACT_ABORT ON;
      BEGIN TRANSACTION;

      DECLARE @lineas TABLE (
        idOrigen nvarchar(150) NOT NULL,
        identificadorDetalle nvarchar(150) NOT NULL,
        PRIMARY KEY (idOrigen, identificadorDetalle)
      );
      INSERT @lineas(idOrigen, identificadorDetalle) VALUES ${valores};

      UPDATE impresion WITH (UPDLOCK, HOLDLOCK)
        SET cantidadImpresiones = impresion.cantidadImpresiones + 1,
            ultimaImpresionEn = SYSUTCDATETIME(),
            idUltimoUsuario = @usuarioId
      FROM dbo.ImpresionArticulo impresion
      INNER JOIN @lineas linea
        ON linea.idOrigen = impresion.idOrigen
       AND linea.identificadorDetalle = impresion.identificadorDetalle;

      INSERT dbo.ImpresionArticulo(
        idOrigen, identificadorDetalle, cantidadImpresiones,
        primeraImpresionEn, ultimaImpresionEn, idUltimoUsuario
      )
      SELECT linea.idOrigen, linea.identificadorDetalle, 1,
        SYSUTCDATETIME(), SYSUTCDATETIME(), @usuarioId
      FROM @lineas linea
      WHERE NOT EXISTS (
        SELECT 1 FROM dbo.ImpresionArticulo impresion WITH (UPDLOCK, HOLDLOCK)
        WHERE impresion.idOrigen = linea.idOrigen
          AND impresion.identificadorDetalle = linea.identificadorDetalle
      );

      COMMIT TRANSACTION;

      SELECT impresion.idOrigen, impresion.identificadorDetalle,
        impresion.cantidadImpresiones, impresion.ultimaImpresionEn
      FROM dbo.ImpresionArticulo impresion
      INNER JOIN @lineas linea
        ON linea.idOrigen = impresion.idOrigen
       AND linea.identificadorDetalle = impresion.identificadorDetalle;
    `);
    return resultado.recordset;
  }
}
