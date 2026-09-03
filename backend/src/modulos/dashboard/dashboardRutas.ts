import { Router } from 'express';
import { ErrorAplicacion } from '../../compartido/errores/errorAplicacion.js';
import { requerirRoles } from '../autenticacion/autenticacionMiddleware.js';
import { DashboardServicio } from './dashboardServicio.js';
import { esquemaFiltrosDashboard } from './dashboardValidacion.js';
import { esquemaDetalleVentasVendedor, esquemaVentasVendedor } from './dashboardValidacion.js';
import { VentasVendedorRepositorio } from './ventasVendedorRepositorio.js';
import { DetalleVentasVendedorRepositorio } from './detalleVentasVendedorRepositorio.js';

export const dashboardRutas = Router();
const servicio = new DashboardServicio();
const ventasVendedor = new VentasVendedorRepositorio();
const detalleVentasVendedor = new DetalleVentasVendedorRepositorio();

dashboardRutas.use(requerirRoles('ADMINISTRADOR'));

dashboardRutas.get('/pedidos', async (solicitud, respuesta, siguiente) => {
  const filtros = esquemaFiltrosDashboard.safeParse(solicitud.query);
  if (!filtros.success) {
    siguiente(new ErrorAplicacion(400, 'FILTROS_DASHBOARD_INVALIDOS',
      filtros.error.issues[0]?.message ?? 'Los filtros del dashboard no son válidos.'));
    return;
  }
  try {
    respuesta.json(await servicio.obtener(filtros.data));
  } catch (error) {
    siguiente(error);
  }
});

dashboardRutas.get('/ventas-por-vendedor', async (solicitud, respuesta, siguiente) => {
  const filtros = esquemaVentasVendedor.safeParse(solicitud.query);
  if (!filtros.success) {
    siguiente(new ErrorAplicacion(400, 'FILTROS_VENTAS_INVALIDOS',
      filtros.error.issues[0]?.message ?? 'Los filtros de ventas no son válidos.'));
    return;
  }
  try { respuesta.json(await ventasVendedor.obtener(filtros.data)); } catch (error) { siguiente(error); }
});

dashboardRutas.get('/ventas-por-vendedor/detalle', async (solicitud, respuesta, siguiente) => {
  const filtros = esquemaDetalleVentasVendedor.safeParse(solicitud.query);
  if (!filtros.success) {
    siguiente(new ErrorAplicacion(400, 'FILTROS_DETALLE_VENTAS_INVALIDOS',
      filtros.error.issues[0]?.message ?? 'Los filtros del detalle no son válidos.'));
    return;
  }
  try {
    respuesta.json(await detalleVentasVendedor.obtener(filtros.data));
  } catch (error) {
    siguiente(error);
  }
});
