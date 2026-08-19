import { Router } from 'express';
import { AlmacenControlador } from './almacenControlador.js';
import { AlmacenRepositorio } from './almacenRepositorio.js';
import { AlmacenServicio } from './almacenServicio.js';

const almacenRepositorio = new AlmacenRepositorio();
const almacenServicio = new AlmacenServicio(almacenRepositorio);
const almacenControlador = new AlmacenControlador(almacenServicio);

export const almacenRutas = Router();

almacenRutas.get('/', almacenControlador.obtenerAlmacenes);

