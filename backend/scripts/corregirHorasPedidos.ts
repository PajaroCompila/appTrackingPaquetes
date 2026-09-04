import 'dotenv/config';
import {
  cerrarConexionPedidosBodega,
  inicializarConexionPedidosBodega,
  obtenerPoolPedidosBodega,
} from '../src/infraestructura/sql/conexionPedidosBodega.js';

await inicializarConexionPedidosBodega();
try {
  const resultado = await obtenerPoolPedidosBodega().request().query<{ corregidos: number }>(`
    IF DB_NAME() <> N'PedidosBodega' THROW 51000, 'Base no autorizada.', 1;

    DECLARE @corregidos int = 0;
    BEGIN TRANSACTION;
    BEGIN TRY
      IF NOT EXISTS (SELECT 1 FROM dbo.MigracionEsquema WHERE versionMigracion = 9)
      BEGIN
        UPDATE dbo.PedidoDespachado
          SET fechaHoraPedido = DATEADD(hour, -6, fechaHoraPedido),
              actualizadoEn = SYSUTCDATETIME()
        WHERE fechaHoraPedido IS NOT NULL;
        SET @corregidos = @@ROWCOUNT;

        INSERT dbo.MigracionEsquema(versionMigracion, nombre)
          VALUES(9, N'corrección de hora local de pedidos despachados');
      END;
      COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
      IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
      THROW;
    END CATCH;
    SELECT @corregidos AS corregidos;
  `);
  console.info(`Horas corregidas en PedidosBodega: ${resultado.recordset[0]?.corregidos ?? 0}.`);
} finally {
  await cerrarConexionPedidosBodega();
}
