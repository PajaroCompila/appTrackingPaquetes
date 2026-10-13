import 'dotenv/config';
import { cerrarConexionPedidosBodega, inicializarConexionPedidosBodega,
  obtenerPoolPedidosBodega } from '../src/infraestructura/sql/conexionPedidosBodega.js';
import { MIGRACION_PERSONAL_ASIGNABLE } from '../src/modulos/personalAsignable/personalAsignableMigracion.js';

await inicializarConexionPedidosBodega();
try {
  await obtenerPoolPedidosBodega().request().query(MIGRACION_PERSONAL_ASIGNABLE);
  const validacion = await obtenerPoolPedidosBodega().request().query<{
    total: number; codigos: number; asignacionesSinCatalogo: number;
  }>(`
    SELECT COUNT(1) total,COUNT(DISTINCT codigoAsignacion) codigos,
      (SELECT COUNT(1) FROM dbo.AsignacionArticuloPedido asignacion
       WHERE asignacion.usuarioAsignado IS NOT NULL
         AND NOT EXISTS(SELECT 1 FROM dbo.PersonalAsignable personal
           WHERE personal.codigoAsignacion=asignacion.usuarioAsignado
             COLLATE Modern_Spanish_100_CI_AI)) asignacionesSinCatalogo
    FROM dbo.PersonalAsignable;`);
  const resultado = validacion.recordset[0]!;
  console.info(`Migración 20 aplicada: ${resultado.total} personas, ${resultado.codigos} códigos únicos, `
    + `${resultado.asignacionesSinCatalogo} asignaciones históricas sin catálogo.`);
} finally {
  await cerrarConexionPedidosBodega();
}
