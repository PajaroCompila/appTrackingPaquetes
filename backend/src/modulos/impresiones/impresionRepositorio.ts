import sql from 'mssql';
import { obtenerPoolPedidosBodega } from '../../infraestructura/sql/conexionPedidosBodega.js';
import type { EstadoImpresionArticulo, IdentidadArticuloImpresion, LineaRegistroImpresion } from './impresion.interface.js';

interface FilaImpresion {
  idOrigen: string;
  identificadorDetalle: string;
  cantidadImpresiones: number;
  ultimaImpresionEn: Date;
  ultimaImpresionPorUsuarioId: string | null;
  ultimaImpresionPor: string | null;
}

function prepararLineas<T extends IdentidadArticuloImpresion>(lineas: T[]): T[] {
  const unicas = new Map<string, T>();
  for (const linea of lineas) {
    const normalizada = {
      ...linea,
      idOrigen: linea.idOrigen.trim(),
      identificadorDetalle: linea.identificadorDetalle.trim(),
    };
    unicas.set(`${normalizada.idOrigen}\u0000${normalizada.identificadorDetalle}`, normalizada);
  }
  return [...unicas.values()].sort((a, b) =>
    a.idOrigen.localeCompare(b.idOrigen) || a.identificadorDetalle.localeCompare(b.identificadorDetalle));
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
      IF DB_NAME() <> N'PedidosBodega' THROW 51000, 'Base no autorizada.', 1;
      DECLARE @lineas TABLE (
        idOrigen nvarchar(150) NOT NULL,
        identificadorDetalle nvarchar(150) NOT NULL,
        PRIMARY KEY (idOrigen, identificadorDetalle)
      );
      INSERT @lineas(idOrigen, identificadorDetalle) VALUES ${valores};

      SELECT impresion.idOrigen, impresion.identificadorDetalle,
        impresion.cantidadImpresiones, impresion.ultimaImpresionEn,
        impresion.idUltimoUsuario AS ultimaImpresionPorUsuarioId,
        usuario.nombreVisible AS ultimaImpresionPor
      FROM dbo.ImpresionArticulo impresion
      LEFT JOIN dbo.UsuarioAplicacion usuario ON usuario.idUsuario = impresion.idUltimoUsuario
      INNER JOIN @lineas linea
        ON linea.idOrigen = impresion.idOrigen
       AND linea.identificadorDetalle = impresion.identificadorDetalle;
    `);
    return resultado.recordset;
  }

  public async registrar(
    lineas: LineaRegistroImpresion[],
    usuarioId: string,
  ): Promise<EstadoImpresionArticulo[]> {
    const unicas = prepararLineas(lineas);
    if (unicas.length === 0) return [];
    const solicitud = obtenerPoolPedidosBodega().request()
      .input('usuarioId', sql.UniqueIdentifier, usuarioId)
      .input('lineasJson', sql.NVarChar(sql.MAX), JSON.stringify(unicas));
    const resultado = await solicitud.query<FilaImpresion>(`
      IF DB_NAME() <> N'PedidosBodega' THROW 51000, 'Base no autorizada.', 1;
      SET XACT_ABORT ON;
      BEGIN TRANSACTION;
      BEGIN TRY
      -- Serializar únicamente el registro breve de impresión entre instancias.
      -- El bloqueo pertenece a esta transacción y se libera al confirmar o revertir.
      DECLARE @resultadoBloqueo int;
      EXEC @resultadoBloqueo = sys.sp_getapplock
        @Resource = N'PedidosBodega:registro-impresion',
        @LockMode = N'Exclusive', @LockOwner = N'Transaction', @LockTimeout = 10000;
      IF @resultadoBloqueo < 0
        THROW 51001, 'No se pudo obtener el bloqueo de registro de impresión.', 1;
      DECLARE @ahora datetime2(3) = SYSUTCDATETIME();
      DECLARE @lineas TABLE (
        idOrigen nvarchar(150) NOT NULL,
        identificadorDetalle nvarchar(150) NOT NULL,
        codigoArticulo nvarchar(100) NULL,
        PRIMARY KEY (idOrigen, identificadorDetalle)
      );
      INSERT @lineas(idOrigen, identificadorDetalle, codigoArticulo)
      SELECT idOrigen, identificadorDetalle, codigoArticulo
      FROM OPENJSON(@lineasJson) WITH (
        idOrigen nvarchar(150), identificadorDetalle nvarchar(150), codigoArticulo nvarchar(100)
      );

      UPDATE impresion WITH (UPDLOCK, HOLDLOCK)
        SET cantidadImpresiones = impresion.cantidadImpresiones + 1,
            ultimaImpresionEn = @ahora,
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
        @ahora, @ahora, @usuarioId
      FROM @lineas linea
      WHERE NOT EXISTS (
        SELECT 1 FROM dbo.ImpresionArticulo impresion WITH (UPDLOCK, HOLDLOCK)
        WHERE impresion.idOrigen = linea.idOrigen
          AND impresion.identificadorDetalle = linea.identificadorDetalle
      );

      INSERT dbo.RegistroImpresionArticulo(
        idOrigen, identificadorDetalle, codigoArticulo, usuarioId, impresoEn, creadoEn
      )
      SELECT idOrigen, identificadorDetalle, codigoArticulo, @usuarioId, @ahora, @ahora
      FROM @lineas;

      SELECT impresion.idOrigen, impresion.identificadorDetalle,
        impresion.cantidadImpresiones, impresion.ultimaImpresionEn,
        impresion.idUltimoUsuario AS ultimaImpresionPorUsuarioId,
        usuario.nombreVisible AS ultimaImpresionPor
      FROM dbo.ImpresionArticulo impresion
      LEFT JOIN dbo.UsuarioAplicacion usuario ON usuario.idUsuario = impresion.idUltimoUsuario
      INNER JOIN @lineas linea
        ON linea.idOrigen = impresion.idOrigen
       AND linea.identificadorDetalle = impresion.identificadorDetalle;
      COMMIT TRANSACTION;
      END TRY
      BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
      END CATCH;
    `);
    return resultado.recordset;
  }
}
