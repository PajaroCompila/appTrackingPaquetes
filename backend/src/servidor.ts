import type { Server } from 'node:http';
import { aplicacion } from './aplicacion.js';
import { configuracion } from './configuracion/configuracion.js';
import { validarSeparacionConexiones } from './configuracion/configuracionBaseDatos.js';
import {
  cerrarConexionSistemaOrigen,
  inicializarConexionSistemaOrigen,
} from './infraestructura/sql/conexionSistemaOrigen.js';
import {
  cerrarConexionPedidosBodega,
  inicializarConexionPedidosBodega,
} from './infraestructura/sql/conexionPedidosBodega.js';
import { cerrarConexionSap } from './infraestructura/sql/conexionSap.js';
import { cerrarConexionesSucursalesR1 } from './infraestructura/sql/conexionSucursalesR1.js';
import {
  detenerSincronizadorHistorial,
  iniciarSincronizadorHistorial,
} from './modulos/historial/sincronizadorHistorial.js';

let servidor: Server | undefined;
let cerrando = false;

async function cerrarServidor(senal: NodeJS.Signals): Promise<void> {
  if (cerrando) {
    return;
  }

  cerrando = true;
  detenerSincronizadorHistorial();
  console.info(`Se recibió ${senal}; cerrando la API.`);

  if (servidor) {
    await new Promise<void>((resolver, rechazar) => {
      servidor?.close((error) => (error ? rechazar(error) : resolver()));
    });
  }

  await Promise.all([cerrarConexionSistemaOrigen(), cerrarConexionPedidosBodega(), cerrarConexionSap(),
    cerrarConexionesSucursalesR1()]);
}

async function iniciarServidor(): Promise<void> {
  validarSeparacionConexiones();
  await Promise.all([inicializarConexionSistemaOrigen(), inicializarConexionPedidosBodega()]);
  iniciarSincronizadorHistorial();
  servidor = aplicacion.listen(configuracion.puerto, () => {
    console.info(`API disponible en el puerto ${configuracion.puerto}.`);
  });
}

process.once('SIGINT', () => {
  void cerrarServidor('SIGINT').catch(() => {
    process.exitCode = 1;
  });
});
process.once('SIGTERM', () => {
  void cerrarServidor('SIGTERM').catch(() => {
    process.exitCode = 1;
  });
});

iniciarServidor().catch(() => {
  console.error('No fue posible iniciar la API.');
  process.exitCode = 1;
});
