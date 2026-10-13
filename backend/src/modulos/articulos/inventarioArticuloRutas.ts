import { Router } from 'express';
import { InventarioArticuloControlador } from './inventarioArticuloControlador.js';
import { InventarioArticuloRepositorio } from './inventarioArticuloRepositorio.js';
import { ImagenArticuloControlador } from './imagenArticuloControlador.js';
import { ImagenArticuloRepositorio } from './imagenArticuloRepositorio.js';

export function crearInventarioArticuloRutas(
  repositorio = new InventarioArticuloRepositorio(),
  repositorioImagen = new ImagenArticuloRepositorio(),
): Router {
  const rutas = Router();
  const controlador = new InventarioArticuloControlador(repositorio);
  const controladorImagen = new ImagenArticuloControlador(repositorioImagen);
  rutas.get('/buscar', controlador.buscar);
  rutas.get('/inventario', controlador.obtenerPorConsulta);
  rutas.get('/imagen', controladorImagen.obtenerPorConsulta);
  rutas.get('/:codigoArticulo/inventario', controlador.obtener);
  rutas.get('/:codigoArticulo/imagen', controladorImagen.obtener);
  return rutas;
}

export const inventarioArticuloRutas = crearInventarioArticuloRutas();

