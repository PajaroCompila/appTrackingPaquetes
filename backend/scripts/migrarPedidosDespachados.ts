import 'dotenv/config';
import { inicializarConexionPedidosBodega, obtenerPoolPedidosBodega, cerrarConexionPedidosBodega } from '../src/infraestructura/sql/conexionPedidosBodega.js';
await inicializarConexionPedidosBodega();
try { await obtenerPoolPedidosBodega().request().query(`
IF DB_NAME()<>N'PedidosBodega' THROW 51000,'Base no autorizada.',1;
IF OBJECT_ID(N'dbo.PedidoDespachado',N'U') IS NULL BEGIN
 CREATE TABLE dbo.PedidoDespachado(idPedidoDespachado bigint IDENTITY CONSTRAINT PK_PedidoDespachado PRIMARY KEY,idOrigen nvarchar(150) NOT NULL CONSTRAINT UQ_PedidoDespachado_idOrigen UNIQUE,origenPedido varchar(3) NOT NULL CONSTRAINT CK_PedidoDespachado_origen CHECK(origenPedido IN('R1','SAP')),folioPedido nvarchar(100) NULL,sapDocEntry nvarchar(50) NULL,numeroPedido nvarchar(100) NOT NULL,fechaHoraPedido datetime2(3) NULL,nombreVendedor nvarchar(200) NULL,creadoEnR1 bit NOT NULL,codigoAlmacen nvarchar(16) NULL,nombreAlmacen nvarchar(200) NULL,estadoLocal varchar(12) NOT NULL CONSTRAINT CK_PedidoDespachado_estado CHECK(estadoLocal IN('DESPACHADO','ENTREGADO')),despachadoEn datetime2(3) NOT NULL CONSTRAINT DF_PedidoDespachado_despachado DEFAULT SYSUTCDATETIME(),entregaDetectadaEn datetime2(3) NULL,idUsuario uniqueidentifier NOT NULL CONSTRAINT FK_PedidoDespachado_usuario REFERENCES dbo.UsuarioAplicacion(idUsuario),creadoEn datetime2(3) NOT NULL CONSTRAINT DF_PedidoDespachado_creado DEFAULT SYSUTCDATETIME(),actualizadoEn datetime2(3) NOT NULL CONSTRAINT DF_PedidoDespachado_actualizado DEFAULT SYSUTCDATETIME());
 CREATE INDEX IX_PedidoDespachado_estado_fecha ON dbo.PedidoDespachado(estadoLocal,despachadoEn DESC);
END;
IF OBJECT_ID(N'dbo.PedidoDespachadoDetalle',N'U') IS NULL BEGIN
 CREATE TABLE dbo.PedidoDespachadoDetalle(idDetalle bigint IDENTITY CONSTRAINT PK_PedidoDespachadoDetalle PRIMARY KEY,idPedidoDespachado bigint NOT NULL CONSTRAINT FK_PedidoDespachadoDetalle_pedido REFERENCES dbo.PedidoDespachado(idPedidoDespachado),numeroLinea int NOT NULL,codigoArticulo nvarchar(100) NULL,descripcion nvarchar(500) NULL,cantidad decimal(19,6) NULL,codigoAlmacen nvarchar(16) NULL,nombreAlmacen nvarchar(200) NULL,creadoEn datetime2(3) NOT NULL CONSTRAINT DF_PedidoDespachadoDetalle_creado DEFAULT SYSUTCDATETIME(),CONSTRAINT UQ_PedidoDespachadoDetalle_linea UNIQUE(idPedidoDespachado,numeroLinea));
END;
IF NOT EXISTS(SELECT 1 FROM dbo.MigracionEsquema WHERE versionMigracion=3) INSERT dbo.MigracionEsquema(versionMigracion,nombre) VALUES(3,N'pedidos despachados encabezado y detalle');
`); console.info('MigraciÃ³n 3 aplicada solo en PedidosBodega.'); } finally { await cerrarConexionPedidosBodega(); }
