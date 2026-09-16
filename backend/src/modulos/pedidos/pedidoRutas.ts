import { Router } from 'express';
import { PedidoControlador } from './pedidoControlador.js';
import type { IPedidoRepositorio } from './pedidoRepositorio.js';
import { PedidoSucursalesRepositorio } from './pedidoSucursalesRepositorio.js';
import { PedidoServicio } from './pedidoServicio.js';
import { DespachoRepositorio, type IDespachoRepositorio } from '../despachos/despachoRepositorio.js';
import { SeguimientoPedidoRepositorio } from './seguimientoPedidoRepositorio.js';
import { ConciliacionEntregaPedido, type IConciliacionEntregaPedido } from './conciliacionEntregaPedido.js';

export function crearPedidoRutas(
  pedidoRepositorio: IPedidoRepositorio = new PedidoSucursalesRepositorio(),
  despachoRepositorio?: IDespachoRepositorio,
  seguimientoRepositorio?: SeguimientoPedidoRepositorio,
  conciliacionEntregas?: IConciliacionEntregaPedido,
): Router {
  const pedidoServicio = new PedidoServicio(
    pedidoRepositorio, undefined, despachoRepositorio, seguimientoRepositorio, conciliacionEntregas,
  );
  const pedidoControlador = new PedidoControlador(pedidoServicio);
  const rutas = Router();

  rutas.get('/', pedidoControlador.buscarPedidos);
  rutas.get('/:folioPedido', pedidoControlador.obtenerDetallePedido);
  return rutas;
}

export const pedidoRutas = crearPedidoRutas(
  new PedidoSucursalesRepositorio(), new DespachoRepositorio(), new SeguimientoPedidoRepositorio(),
  new ConciliacionEntregaPedido(),
);
