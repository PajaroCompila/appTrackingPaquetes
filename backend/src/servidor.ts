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
let dependenciasDatosDisponibles = false;
let inicializandoDependenciasDatos = false;
let temporizadorReintentoDependencias: NodeJS.Timeout | undefined;

const tiempoMaximoInicializacionDatosMs = 35000;
const retrasoReintentoInicializacionDatosMs = 15000;

function conTiempoMaximo<T>(promesa: Promise<T>, tiempoMaximoMs: number, descripcion: string): Promise<T> {
  let temporizador: NodeJS.Timeout | undefined;
  const tiempoAgotado = new Promise<never>((_, rechazar) => {
    temporizador = setTimeout(() => {
      rechazar(new Error(`${descripcion} superó ${tiempoMaximoMs} ms.`));
    }, tiempoMaximoMs);
    temporizador.unref();
  });

  return Promise.race([promesa, tiempoAgotado]).finally(() => {
    if (temporizador) {
      clearTimeout(temporizador);
    }
  });
}

function programarReintentoDependenciasDatos(): void {
  if (cerrando || temporizadorReintentoDependencias) {
    return;
  }

  temporizadorReintentoDependencias = setTimeout(() => {
    temporizadorReintentoDependencias = undefined;
    void inicializarDependenciasDatos();
  }, retrasoReintentoInicializacionDatosMs);
  temporizadorReintentoDependencias.unref();
}

async function inicializarDependenciasDatos(): Promise<void> {
  if (dependenciasDatosDisponibles || inicializandoDependenciasDatos || cerrando) {
    return;
  }

  inicializandoDependenciasDatos = true;
  try {
    await conTiempoMaximo(
      Promise.all([inicializarConexionSistemaOrigen(), inicializarConexionPedidosBodega()]),
      tiempoMaximoInicializacionDatosMs,
      'La inicialización de conexiones SQL',
    );
    dependenciasDatosDisponibles = true;
    iniciarSincronizadorHistorial();
    console.info('Conexiones SQL disponibles.');
  } catch (error) {
    console.error('No fue posible inicializar las conexiones SQL; se reintentará en segundo plano.', error);
    programarReintentoDependenciasDatos();
  } finally {
    inicializandoDependenciasDatos = false;
  }
}

async function cerrarServidor(senal: NodeJS.Signals): Promise<void> {
  if (cerrando) {
    return;
  }

  cerrando = true;
  detenerSincronizadorHistorial();
  if (temporizadorReintentoDependencias) {
    clearTimeout(temporizadorReintentoDependencias);
    temporizadorReintentoDependencias = undefined;
  }
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
  servidor = aplicacion.listen(configuracion.puerto, () => {
    console.info(`API disponible en el puerto ${configuracion.puerto}.`);
  });
  void inicializarDependenciasDatos();
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
