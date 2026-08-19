import type { FiltrosDashboard, RespuestaDashboard } from './dashboard.interface.js';
import { DashboardRepositorio, type IDashboardRepositorio } from './dashboardRepositorio.js';

function fechaHoraTegucigalpa(fecha: Date): string {
  return new Date(fecha.getTime() - 6 * 60 * 60 * 1000).toISOString().replace('Z', '-06:00');
}

export class DashboardServicio {
  public constructor(private readonly repositorio: IDashboardRepositorio = new DashboardRepositorio()) {}

  public async obtener(filtros: FiltrosDashboard): Promise<RespuestaDashboard> {
    const [porTienda, tiendas] = await Promise.all([
      this.repositorio.obtenerResumen(filtros), this.repositorio.obtenerTiendas(),
    ]);
    return {
      fechaDesde: filtros.fechaDesde,
      fechaHasta: filtros.fechaHasta,
      totales: porTienda.reduce((totales, tienda) => ({
        pendientes: totales.pendientes + tienda.pendientes,
        validados: totales.validados + tienda.validados,
      }), { pendientes: 0, validados: 0 }),
      porTienda,
      tiendas,
      consultadoEn: fechaHoraTegucigalpa(new Date()),
    };
  }
}
