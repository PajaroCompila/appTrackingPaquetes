import 'dotenv/config';
import argon2 from 'argon2';
import sql from 'mssql';
import { cerrarConexionPedidosBodega, inicializarConexionPedidosBodega, obtenerPoolPedidosBodega } from '../src/infraestructura/sql/conexionPedidosBodega.js';

function argumento(nombre: string): string | undefined {
  const indice = process.argv.indexOf(`--${nombre}`);
  return indice >= 0 ? process.argv[indice + 1]?.trim() : undefined;
}

const nombreUsuario = argumento('nombre');
const nombreVisible = argumento('visible');
const contrasena = process.env.USUARIO_INICIAL_CONTRASENA;
delete process.env.USUARIO_INICIAL_CONTRASENA;
if (!nombreUsuario || nombreUsuario.length > 100 || !nombreVisible || nombreVisible.length > 150
  || !contrasena || contrasena.length < 10 || contrasena.length > 128
  || contrasena.toLocaleLowerCase() === nombreUsuario.toLocaleLowerCase()) {
  throw new Error('IndicÃ¡ --nombre, --visible y USUARIO_INICIAL_CONTRASENA temporal.');
}

const hash = await argon2.hash(contrasena, {
  type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1,
});
await inicializarConexionPedidosBodega();
try {
  const pool = obtenerPoolPedidosBodega();
  const estructura = await pool.request().query<{ preparada: number }>(`
    SELECT CASE WHEN COL_LENGTH(N'dbo.UsuarioAplicacion', N'nombreVisible') IS NOT NULL
      AND OBJECT_ID(N'dbo.SesionAutenticada', N'U') IS NOT NULL THEN 1 ELSE 0 END AS preparada;
  `);
  if (estructura.recordset[0]?.preparada !== 1) throw new Error('EjecutÃ¡ primero npm run db:migrate:auth.');
  await pool.request()
    .input('nombreUsuario', sql.NVarChar(100), nombreUsuario)
    .input('nombreVisible', sql.NVarChar(150), nombreVisible)
    .input('hashContrasena', sql.VarBinary(256), Buffer.from(hash, 'utf8'))
    .query(`
      IF NOT EXISTS (SELECT 1 FROM dbo.UsuarioAplicacion WHERE nombreUsuario = @nombreUsuario)
      BEGIN
        DECLARE @rolId uniqueidentifier=(SELECT idRol FROM dbo.RolAplicacion WHERE codigo=N'ADMINISTRADOR');
        INSERT INTO dbo.UsuarioAplicacion(nombreUsuario, nombreVisible, nombreCompleto,
          hashContrasena, algoritmoContrasena, codigoRol, rolId, activo, debeCambiarContrasena)
        VALUES (@nombreUsuario, @nombreVisible, @nombreVisible, @hashContrasena,
          N'argon2id', N'ADMINISTRADOR', @rolId, 1, 1);
      END;
    `);
  console.info('Usuario local creado sin mostrar credenciales.');
} finally {
  await cerrarConexionPedidosBodega();
}
