import { Router } from 'express';
import { SaludControlador } from './saludControlador.js';
import { SaludServicio } from './saludServicio.js';

const saludServicio = new SaludServicio();
const saludControlador = new SaludControlador(saludServicio);

export const saludRutas = Router();

saludRutas.get('/', saludControlador.obtenerEstado);

