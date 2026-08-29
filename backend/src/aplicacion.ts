import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { configuracion } from './configuracion/configuracion.js';
import { manejarError, manejarRutaNoEncontrada } from './compartido/middleware/error.middleware.js';
import { asignarIdSeguimiento } from './compartido/middleware/seguimiento.middleware.js';
import { saludRutas } from './modulos/salud/saludRutas.js';
import { almacenRutas } from './modulos/almacenes/almacenRutas.js';
import { pedidoRutas } from './modulos/pedidos/pedidoRutas.js';
import { historialRutas } from './modulos/historial/historialRutas.js';
import { autenticacionRutas } from './modulos/autenticacion/autenticacionRutas.js';
import { requerirAutenticacion, requerirContrasenaActualizada } from './modulos/autenticacion/autenticacionMiddleware.js';
import { usuarioRutas } from './modulos/usuarios/usuarioRutas.js';
import { despachoRutas } from './modulos/despachos/despachoRutas.js';
import { inventarioArticuloRutas } from './modulos/articulos/inventarioArticuloRutas.js';
import { dashboardRutas } from './modulos/dashboard/dashboardRutas.js';

export const aplicacion = express();
const directorioFrontend = join(dirname(fileURLToPath(import.meta.url)), '../../frontend/dist/frontend/browser');
const archivoIndiceFrontend = join(directorioFrontend, 'index.html');

function esOrigenLocalPermitido(origen: string): boolean {
  try {
    const url = new URL(origen);
    const esPuertoFrontend = url.protocol === 'http:' && url.port === '4400';
    const esEquipoLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    const esRedPrivada =
      /^10\./.test(url.hostname) ||
      /^192\.168\./.test(url.hostname) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(url.hostname);
    return esPuertoFrontend && (esEquipoLocal || esRedPrivada);
  } catch {
    return false;
  }
}

aplicacion.disable('x-powered-by');
aplicacion.use(helmet());
aplicacion.use(
  cors({
    origin(origen, continuar) {
      const permitido =
        !origen || origen === configuracion.origenCors || esOrigenLocalPermitido(origen);
      continuar(null, permitido);
    },
    methods: ['GET', 'POST', 'PATCH'],
    credentials: true,
  }),
);
aplicacion.use(express.json({ limit: '16kb' }));
aplicacion.use(cookieParser());
aplicacion.use(asignarIdSeguimiento);
aplicacion.use(
  pinoHttp({
    quietReqLogger: true,
    redact: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.url',
      'req.query',
      'req.params',
    ],
  }),
);

aplicacion.use('/api/autenticacion', autenticacionRutas);
aplicacion.use('/api/salud', saludRutas);
aplicacion.use('/api/usuarios', requerirAutenticacion, requerirContrasenaActualizada, usuarioRutas);
aplicacion.use('/api/almacenes', requerirAutenticacion, requerirContrasenaActualizada, almacenRutas);
aplicacion.use('/api/pedidos', requerirAutenticacion, requerirContrasenaActualizada, pedidoRutas);
aplicacion.use('/api/articulos', requerirAutenticacion, requerirContrasenaActualizada, inventarioArticuloRutas);
aplicacion.use('/api/historial-validados', requerirAutenticacion, requerirContrasenaActualizada, historialRutas);
aplicacion.use('/api/pedidos-despachados', requerirAutenticacion, requerirContrasenaActualizada, despachoRutas);
aplicacion.use('/api/dashboard', requerirAutenticacion, requerirContrasenaActualizada, dashboardRutas);

if (configuracion.servirFrontend) {
  if (existsSync(archivoIndiceFrontend)) {
    aplicacion.use(express.static(directorioFrontend, {
      index: false,
      maxAge: configuracion.entorno === 'produccion' ? '1h' : 0,
    }));
    aplicacion.get(/^\/(?!api(?:\/|$)).*/, (_solicitud, respuesta) => {
      respuesta.sendFile(archivoIndiceFrontend);
    });
  } else {
    console.warn('SERVIR_FRONTEND está activo, pero no existe el build de Angular.');
  }
}

aplicacion.use(manejarRutaNoEncontrada);
aplicacion.use(manejarError);
