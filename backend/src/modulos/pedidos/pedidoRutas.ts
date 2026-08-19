import { Router } from 'express';
import { PedidoControlador } from './pedidoControlador.js';
import type { IPedidoRepositorio } from './pedidoRepositorio.js';
import { PedidoSucursalesRepositorio } from './pedidoSucursalesRepositorio.js';
import { PedidoServicio } from './pedidoServicio.js';
import { DespachoRepositorio, type IDespachoRepositorio } from '../despachos/despachoRepositorio.js';

export function crearPedidoRutas(
  pedidoRepositorio: IPedidoRepositorio = new PedidoSucursalesRepositorio(),
  despachoRepositorio?: IDespachoRepositorio,
): Router {
  const pedidoServicio = new PedidoServicio(pedidoRepositorio, undefined, despachoRepositorio);
  const pedidoControlador = new PedidoControlador(pedidoServicio);
  const rutas = Router();

  rutas.get('/', pedidoControlador.buscarPedidos);
  rutas.get('/:folioPedido', pedidoControlador.obtenerDetallePedido);
  return rutas;
}

export const pedidoRutas = crearPedidoRutas(new PedidoSucursalesRepositorio(), new DespachoRepositorio());
