import 'dotenv/config';
import argon2 from 'argon2';
import sql from 'mssql';
import {
  cerrarConexionPedidosBodega,
  inicializarConexionPedidosBodega,
  obtenerPoolPedidosBodega,
} from '../src/infraestructura/sql/conexionPedidosBodega.js';

function argumento(nombre: string): string | undefined {
  const indice = process.argv.indexOf(`--${nombre}`);
  return indice >= 0 ? process.argv[indice + 1]?.trim() : undefined;
}

const nombreUsuario = argumento('nombre');
const contrasena = process.env.USUARIO_NUEVA_CONTRASENA;
delete process.env.USUARIO_NUEVA_CONTRASENA;
if (!nombreUsuario || nombreUsuario.length > 100 || !contrasena) {
  throw new Error('IndicÃ¡ --nombre y USUARIO_NUEVA_CONTRASENA temporal.');
}

const hash = await argon2.hash(contrasena, {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
});

await inicializarConexionPedidosBodega();
try {
  const resultado = await obtenerPoolPedidosBodega()
    .request()
    .input('nombreUsuario', sql.NVarChar(100), nombreUsuario)
    .input('hashContrasena', sql.VarBinary(256), Buffer.from(hash, 'utf8'))
    .query(`
      SET XACT_ABORT ON;
      BEGIN TRANSACTION;
      UPDATE dbo.UsuarioAplicacion
      SET hashContrasena = @hashContrasena,
          algoritmoContrasena = N'argon2id',
          actualizadoEn = SYSUTCDATETIME()
      WHERE nombreUsuario = @nombreUsuario;

      IF @@ROWCOUNT = 0
        THROW 51000, 'El usuario indicado no existe.', 1;

      UPDATE s
      SET revocadaEn = COALESCE(s.revocadaEn, SYSUTCDATETIME())
      FROM dbo.SesionAutenticada s
      JOIN dbo.UsuarioAplicacion u ON u.idUsuario = s.idUsuario
      WHERE u.nombreUsuario = @nombreUsuario
        AND s.revocadaEn IS NULL;
      COMMIT TRANSACTION;
    `);
  void resultado;
  console.info('ContraseÃ±a actualizada y sesiones anteriores revocadas sin exponer credenciales.');
} finally {
  await cerrarConexionPedidosBodega();
}
