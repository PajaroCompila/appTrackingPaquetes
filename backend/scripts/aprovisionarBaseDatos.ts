import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import 'dotenv/config';
import sql from 'mssql';
import {
  baseAplicacionAutorizada,
  servidorAutorizado,
} from '../src/configuracion/configuracionBaseDatos.js';
import { obtenerConfiguracionSql } from '../src/configuracion/configuracionSql.js';
import { crearPoolSql } from '../src/infraestructura/sql/crearPoolSql.js';

const usuarioEjecucion = 'pedidos_bodega_app';
const rutaEnv = resolve(process.cwd(), '.env');

function escaparLiteralSql(valor: string): string {
  return valor.replaceAll("'", "''");
}

async function guardarVariablesEjecucion(contrasena: string): Promise<void> {
  const contenidoActual = await readFile(rutaEnv, 'utf8');
  const variables = new Map<string, string>();
  for (const linea of contenidoActual.split(/\r?\n/)) {
    const separador = linea.indexOf('=');
    if (separador > 0 && !linea.trimStart().startsWith('#')) {
      variables.set(linea.slice(0, separador).trim(), linea.slice(separador + 1));
    }
  }

  const nuevasVariables: Record<string, string> = {
    PEDIDOS_BODEGA_SQL_SERVIDOR: servidorAutorizado,
    PEDIDOS_BODEGA_SQL_PUERTO: variables.get('SQL_PUERTO') ?? '1433',
    PEDIDOS_BODEGA_SQL_BASE_DATOS: baseAplicacionAutorizada,
    PEDIDOS_BODEGA_SQL_USUARIO: usuarioEjecucion,
    PEDIDOS_BODEGA_SQL_CONTRASENA: contrasena,
    PEDIDOS_BODEGA_SQL_CIFRAR: variables.get('SQL_CIFRAR') ?? 'false',
    PEDIDOS_BODEGA_SQL_CONFIAR_CERTIFICADO: variables.get('SQL_CONFIAR_CERTIFICADO') ?? 'false',
    PEDIDOS_BODEGA_SQL_TIEMPO_ESPERA_CONEXION_MS:
      variables.get('SQL_TIEMPO_ESPERA_CONEXION_MS') ?? '5000',
    PEDIDOS_BODEGA_SQL_TIEMPO_MAXIMO_CONSULTA_MS:
      variables.get('SQL_TIEMPO_MAXIMO_CONSULTA_MS') ?? '10000',
    PEDIDOS_BODEGA_SQL_POOL_MINIMO: '0',
    PEDIDOS_BODEGA_SQL_POOL_MAXIMO: '5',
  };

  const clavesNuevas = new Set(Object.keys(nuevasVariables));
  const lineasConservadas = contenidoActual
    .split(/\r?\n/)
    .filter((linea) => {
      const separador = linea.indexOf('=');
      return separador <= 0 || !clavesNuevas.has(linea.slice(0, separador).trim());
    });
  const bloque = Object.entries(nuevasVariables).map(([clave, valor]) => `${clave}=${valor}`);
  const contenido = [...lineasConservadas.filter((linea, indice, lineas) =>
    linea !== '' || indice < lineas.length - 1), '', ...bloque, ''].join('\n');
  await writeFile(rutaEnv, contenido, { encoding: 'utf8', mode: 0o600 });
}

async function aprovisionar(): Promise<void> {
  const administracion = obtenerConfiguracionSql();
  if (administracion.servidor !== servidorAutorizado) {
    throw new Error(`Aprovisionamiento rechazado: el servidor no es ${servidorAutorizado}.`);
  }

  const contrasenaEjecucion =
    process.env.PEDIDOS_BODEGA_SQL_CONTRASENA ?? randomBytes(32).toString('base64url');
  const contrasenaSql = escaparLiteralSql(contrasenaEjecucion);
  let poolMaster: sql.ConnectionPool | undefined;
  let poolAplicacion: sql.ConnectionPool | undefined;

  try {
    poolMaster = crearPoolSql(
      { ...administracion, baseDatos: 'master' },
      'Pedidos Bodega - aprovisionamiento',
      false,
    );
    await poolMaster.connect();
    const servidor = await poolMaster.request().query<{ servidor: string; baseActual: string }>(`
      SELECT CAST(CONNECTIONPROPERTY('local_net_address') AS nvarchar(128)) AS servidor,
             DB_NAME() AS baseActual;
    `);
    if (servidor.recordset[0]?.baseActual !== 'master') {
      throw new Error('El contexto administrativo inicial no es master.');
    }

    await poolMaster.request().query(`
      IF DB_ID(N'PedidosBodega') IS NULL
        CREATE DATABASE [PedidosBodega];
    `);

    await poolMaster.request().query(`
      IF SUSER_ID(N'pedidos_bodega_app') IS NULL
        CREATE LOGIN [pedidos_bodega_app]
          WITH PASSWORD = N'${contrasenaSql}', CHECK_POLICY = ON,
               CHECK_EXPIRATION = OFF, DEFAULT_DATABASE = [PedidosBodega];
      ELSE
        ALTER LOGIN [pedidos_bodega_app]
          WITH PASSWORD = N'${contrasenaSql}', DEFAULT_DATABASE = [PedidosBodega];
    `);

    poolAplicacion = crearPoolSql(
      { ...administracion, baseDatos: baseAplicacionAutorizada },
      'Pedidos Bodega - migraciones',
      false,
    );
    await poolAplicacion.connect();
    const base = await poolAplicacion.request().query<{ baseActual: string }>('SELECT DB_NAME() AS baseActual;');
    if (base.recordset[0]?.baseActual !== baseAplicacionAutorizada) {
      throw new Error('Las migraciones no están conectadas a PedidosBodega.');
    }

    await poolAplicacion.request().query(`
      IF OBJECT_ID(N'dbo.MigracionEsquema', N'U') IS NULL
      BEGIN
        CREATE TABLE dbo.MigracionEsquema (
          versionMigracion int NOT NULL CONSTRAINT PK_MigracionEsquema PRIMARY KEY,
          nombre nvarchar(150) NOT NULL,
          aplicadaEn datetime2(3) NOT NULL CONSTRAINT DF_MigracionEsquema_aplicadaEn DEFAULT SYSUTCDATETIME()
        );
      END;

      IF OBJECT_ID(N'dbo.UsuarioAplicacion', N'U') IS NULL
      BEGIN
        CREATE TABLE dbo.UsuarioAplicacion (
          idUsuario uniqueidentifier NOT NULL CONSTRAINT PK_UsuarioAplicacion PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
          nombreUsuario nvarchar(100) NOT NULL,
          hashContrasena varbinary(256) NOT NULL,
          algoritmoContrasena nvarchar(50) NOT NULL,
          codigoRol nvarchar(50) NULL,
          codigoAlmacen nvarchar(16) NULL,
          activo bit NOT NULL CONSTRAINT DF_UsuarioAplicacion_activo DEFAULT 1,
          creadoEn datetime2(3) NOT NULL CONSTRAINT DF_UsuarioAplicacion_creadoEn DEFAULT SYSUTCDATETIME(),
          actualizadoEn datetime2(3) NOT NULL CONSTRAINT DF_UsuarioAplicacion_actualizadoEn DEFAULT SYSUTCDATETIME(),
          CONSTRAINT UQ_UsuarioAplicacion_nombreUsuario UNIQUE (nombreUsuario)
        );
      END;

      IF OBJECT_ID(N'dbo.HistorialPedidoValidado', N'U') IS NULL
      BEGIN
        CREATE TABLE dbo.HistorialPedidoValidado (
          idHistorial bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_HistorialPedidoValidado PRIMARY KEY,
          folioPedido nvarchar(100) NOT NULL,
          fechaPedido date NULL,
          codigoSucursal nvarchar(16) NULL,
          codigoAlmacen nvarchar(16) NOT NULL,
          codigoEstadoVenta nvarchar(2) NULL,
          observadoValidadoEn datetime2(3) NOT NULL,
          ultimaObservacionEn datetime2(3) NOT NULL,
          CONSTRAINT UQ_HistorialPedidoValidado_folio_almacen UNIQUE (folioPedido, codigoAlmacen)
        );
        CREATE INDEX IX_HistorialPedidoValidado_fecha
          ON dbo.HistorialPedidoValidado(observadoValidadoEn DESC, folioPedido DESC);
        CREATE INDEX IX_HistorialPedidoValidado_filtros
          ON dbo.HistorialPedidoValidado(codigoSucursal, codigoAlmacen, observadoValidadoEn DESC);
      END;

      IF OBJECT_ID(N'dbo.EventoAplicacion', N'U') IS NULL
      BEGIN
        CREATE TABLE dbo.EventoAplicacion (
          idEvento bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_EventoAplicacion PRIMARY KEY,
          tipoEvento nvarchar(80) NOT NULL,
          resultado nvarchar(30) NOT NULL,
          folioPedido nvarchar(100) NULL,
          idUsuario uniqueidentifier NULL,
          codigoAlmacen nvarchar(16) NULL,
          idSeguimiento uniqueidentifier NOT NULL,
          detalleSeguro nvarchar(500) NULL,
          ocurridoEn datetime2(3) NOT NULL CONSTRAINT DF_EventoAplicacion_ocurridoEn DEFAULT SYSUTCDATETIME(),
          CONSTRAINT FK_EventoAplicacion_usuario FOREIGN KEY (idUsuario) REFERENCES dbo.UsuarioAplicacion(idUsuario)
        );
        CREATE INDEX IX_EventoAplicacion_folio_fecha
          ON dbo.EventoAplicacion(folioPedido, ocurridoEn DESC);
      END;

      IF OBJECT_ID(N'dbo.SincronizacionHistorial', N'U') IS NULL
      BEGIN
        CREATE TABLE dbo.SincronizacionHistorial (
          idSincronizacion bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_SincronizacionHistorial PRIMARY KEY,
          idSeguimiento uniqueidentifier NOT NULL CONSTRAINT UQ_SincronizacionHistorial_seguimiento UNIQUE,
          fechaDesde date NOT NULL,
          iniciadaEn datetime2(3) NOT NULL,
          finalizadaEn datetime2(3) NULL,
          resultado nvarchar(30) NOT NULL,
          registrosObservados int NOT NULL CONSTRAINT DF_SincronizacionHistorial_observados DEFAULT 0,
          detalleSeguro nvarchar(500) NULL
        );
      END;

      IF OBJECT_ID(N'dbo.ImpresionArticulo', N'U') IS NULL
      BEGIN
        CREATE TABLE dbo.ImpresionArticulo (
          idImpresion bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_ImpresionArticulo PRIMARY KEY,
          idOrigen nvarchar(150) NOT NULL,
          identificadorDetalle nvarchar(150) NOT NULL,
          cantidadImpresiones int NOT NULL CONSTRAINT DF_ImpresionArticulo_cantidad DEFAULT 1,
          primeraImpresionEn datetime2(3) NOT NULL CONSTRAINT DF_ImpresionArticulo_primera DEFAULT SYSUTCDATETIME(),
          ultimaImpresionEn datetime2(3) NOT NULL CONSTRAINT DF_ImpresionArticulo_ultima DEFAULT SYSUTCDATETIME(),
          idUltimoUsuario uniqueidentifier NOT NULL,
          CONSTRAINT UQ_ImpresionArticulo_identidad UNIQUE(idOrigen, identificadorDetalle),
          CONSTRAINT FK_ImpresionArticulo_usuario FOREIGN KEY(idUltimoUsuario)
            REFERENCES dbo.UsuarioAplicacion(idUsuario),
          CONSTRAINT CK_ImpresionArticulo_cantidad CHECK(cantidadImpresiones > 0)
        );
        CREATE INDEX IX_ImpresionArticulo_ultima
          ON dbo.ImpresionArticulo(ultimaImpresionEn DESC);
      END;

      IF OBJECT_ID(N'dbo.AsignacionArticuloPedido', N'U') IS NULL
      BEGIN
        CREATE TABLE dbo.AsignacionArticuloPedido (
          idOrigen nvarchar(150) NOT NULL,
          identificadorDetalle nvarchar(150) NOT NULL,
          usuarioAsignado nvarchar(100) NULL,
          nombreAsignado nvarchar(150) NULL,
          asignadoPor uniqueidentifier NOT NULL,
          creadoEn datetime2(3) NOT NULL
            CONSTRAINT DF_AsignacionArticuloPedido_creado DEFAULT SYSUTCDATETIME(),
          actualizadoEn datetime2(3) NOT NULL
            CONSTRAINT DF_AsignacionArticuloPedido_actualizado DEFAULT SYSUTCDATETIME(),
          CONSTRAINT PK_AsignacionArticuloPedido PRIMARY KEY(idOrigen, identificadorDetalle),
          CONSTRAINT FK_AsignacionArticuloPedido_usuario FOREIGN KEY(asignadoPor)
            REFERENCES dbo.UsuarioAplicacion(idUsuario)
        );
        CREATE INDEX IX_AsignacionArticuloPedido_usuario
          ON dbo.AsignacionArticuloPedido(usuarioAsignado, actualizadoEn DESC);
      END;

      IF OBJECT_ID(N'dbo.SeguimientoPedido', N'U') IS NULL
      BEGIN
        CREATE TABLE dbo.SeguimientoPedido (
          idOrigen nvarchar(150) NOT NULL CONSTRAINT PK_SeguimientoPedido PRIMARY KEY,
          origenPedido varchar(3) NOT NULL,
          fechaEntradaCola datetimeoffset(3) NOT NULL,
          codigoUsuarioOrigen nvarchar(50) NULL,
          excluidoSla bit NOT NULL CONSTRAINT DF_SeguimientoPedido_excluido DEFAULT 0,
          huellaActual nvarchar(max) NULL,
          modificadoEn datetimeoffset(3) NULL,
          modificadoPor nvarchar(200) NULL,
          observadoEn datetime2(3) NOT NULL CONSTRAINT DF_SeguimientoPedido_observado DEFAULT SYSUTCDATETIME(),
          actualizadoEn datetime2(3) NOT NULL CONSTRAINT DF_SeguimientoPedido_actualizado DEFAULT SYSUTCDATETIME()
        );
        CREATE INDEX IX_SeguimientoPedido_modificado ON dbo.SeguimientoPedido(modificadoEn, idOrigen);
      END;

      IF OBJECT_ID(N'dbo.SeguimientoPedidoDetalle', N'U') IS NULL
      BEGIN
        CREATE TABLE dbo.SeguimientoPedidoDetalle (
          idOrigen nvarchar(150) NOT NULL,
          identificadorDetalle nvarchar(150) NOT NULL,
          codigoArticulo nvarchar(100) NULL,
          descripcion nvarchar(500) NULL,
          cantidad decimal(19,6) NULL,
          codigoAlmacen nvarchar(16) NULL,
          activo bit NOT NULL CONSTRAINT DF_SeguimientoPedidoDetalle_activo DEFAULT 1,
          CONSTRAINT PK_SeguimientoPedidoDetalle PRIMARY KEY(idOrigen, identificadorDetalle),
          CONSTRAINT FK_SeguimientoPedidoDetalle_pedido FOREIGN KEY(idOrigen)
            REFERENCES dbo.SeguimientoPedido(idOrigen)
        );
      END;
      IF COL_LENGTH(N'dbo.SeguimientoPedidoDetalle', N'activo') IS NULL
        ALTER TABLE dbo.SeguimientoPedidoDetalle ADD activo bit NOT NULL
          CONSTRAINT DF_SeguimientoPedidoDetalle_activo DEFAULT 1;

      UPDATE dbo.SeguimientoPedido
        SET fechaEntradaCola = TODATETIMEOFFSET(observadoEn, '+00:00')
        WHERE origenPedido = 'R1';

      IF OBJECT_ID(N'dbo.ModificacionPedido', N'U') IS NULL
      BEGIN
        CREATE TABLE dbo.ModificacionPedido (
          idModificacion bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_ModificacionPedido PRIMARY KEY,
          idOrigen nvarchar(150) NOT NULL,
          detectadoEn datetimeoffset(3) NOT NULL,
          modificadoPor nvarchar(200) NULL,
          CONSTRAINT FK_ModificacionPedido_pedido FOREIGN KEY(idOrigen)
            REFERENCES dbo.SeguimientoPedido(idOrigen)
        );
        CREATE INDEX IX_ModificacionPedido_pedido ON dbo.ModificacionPedido(idOrigen, detectadoEn);
      END;

      IF OBJECT_ID(N'dbo.ModificacionPedidoDetalle', N'U') IS NULL
      BEGIN
        CREATE TABLE dbo.ModificacionPedidoDetalle (
          idModificacionDetalle bigint IDENTITY(1,1) NOT NULL
            CONSTRAINT PK_ModificacionPedidoDetalle PRIMARY KEY,
          idModificacion bigint NOT NULL,
          tipo varchar(12) NOT NULL,
          identificadorDetalle nvarchar(150) NOT NULL,
          codigoArticulo nvarchar(100) NULL,
          descripcion nvarchar(500) NULL,
          cantidadAnterior decimal(19,6) NULL,
          cantidadNueva decimal(19,6) NULL,
          codigoAlmacenAnterior nvarchar(16) NULL,
          codigoAlmacenNuevo nvarchar(16) NULL,
          CONSTRAINT FK_ModificacionPedidoDetalle_modificacion FOREIGN KEY(idModificacion)
            REFERENCES dbo.ModificacionPedido(idModificacion),
          CONSTRAINT CK_ModificacionPedidoDetalle_tipo
            CHECK (tipo IN ('AGREGADO', 'ELIMINADO', 'CANTIDAD', 'BODEGA'))
        );
      END;

      IF NOT EXISTS (SELECT 1 FROM dbo.MigracionEsquema WHERE versionMigracion = 1)
        INSERT INTO dbo.MigracionEsquema(versionMigracion, nombre)
        VALUES (1, N'esquema inicial de usuarios, historial y auditoría');

      IF USER_ID(N'pedidos_bodega_app') IS NULL
        CREATE USER [pedidos_bodega_app] FOR LOGIN [pedidos_bodega_app];

      GRANT CONNECT TO [pedidos_bodega_app];
      GRANT SELECT, INSERT, UPDATE ON dbo.UsuarioAplicacion TO [pedidos_bodega_app];
      GRANT SELECT, INSERT, UPDATE ON dbo.HistorialPedidoValidado TO [pedidos_bodega_app];
      GRANT SELECT, INSERT ON dbo.EventoAplicacion TO [pedidos_bodega_app];
      GRANT SELECT, INSERT, UPDATE ON dbo.SincronizacionHistorial TO [pedidos_bodega_app];
      GRANT SELECT, INSERT, UPDATE ON dbo.ImpresionArticulo TO [pedidos_bodega_app];
      GRANT SELECT, INSERT, UPDATE ON dbo.AsignacionArticuloPedido TO [pedidos_bodega_app];
      GRANT SELECT, INSERT, UPDATE ON dbo.SeguimientoPedido TO [pedidos_bodega_app];
      GRANT SELECT, INSERT, UPDATE ON dbo.SeguimientoPedidoDetalle TO [pedidos_bodega_app];
      GRANT SELECT, INSERT ON dbo.ModificacionPedido TO [pedidos_bodega_app];
      GRANT SELECT, INSERT ON dbo.ModificacionPedidoDetalle TO [pedidos_bodega_app];
      GRANT SELECT ON dbo.MigracionEsquema TO [pedidos_bodega_app];
      DENY DELETE TO [pedidos_bodega_app];
    `);

    await guardarVariablesEjecucion(contrasenaEjecucion);
    console.info('Aprovisionamiento de PedidosBodega completado sin exponer credenciales.');
  } finally {
    if (poolAplicacion) await poolAplicacion.close();
    if (poolMaster) await poolMaster.close();
    await sql.close();
  }
}

aprovisionar().catch((error: unknown) => {
  const mensaje = error instanceof Error ? error.message : 'Error desconocido de aprovisionamiento.';
  console.error(mensaje);
  process.exitCode = 1;
});
