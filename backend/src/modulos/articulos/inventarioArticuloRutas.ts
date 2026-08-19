import { Router } from 'express';
import { InventarioArticuloControlador } from './inventarioArticuloControlador.js';
import { InventarioArticuloRepositorio } from './inventarioArticuloRepositorio.js';

export function crearInventarioArticuloRutas(
  repositorio = new InventarioArticuloRepositorio(),
): Router {
  const rutas = Router();
  const controlador = new InventarioArticuloControlador(repositorio);
  rutas.get('/:codigoArticulo/inventario', controlador.obtener);
  return rutas;
}

export const inventarioArticuloRutas = crearInventarioArticuloRutas();

