import { Injectable, signal } from '@angular/core';
import {
  guardarFiltrosSesion,
  leerFiltrosSesion,
  esFechaCalendarioValida,
  obtenerFechaLocalActual,
} from './estado-filtros-sesion';

export interface FiltrosGlobales {
  fechaDesde: string;
  fechaHasta: string;
  codigosAlmacen: string[];
}

const claveFiltrosGlobales = 'globales';
const expresionAlmacen = /^[A-Za-z0-9_-]{1,16}$/;

@Injectable({ providedIn: 'root' })
export class FiltrosGlobalesService {
  private readonly estado = signal<FiltrosGlobales>(this.cargar());

  public obtener(): FiltrosGlobales {
    const filtros = this.estado();
    return { ...filtros, codigosAlmacen: [...filtros.codigosAlmacen] };
  }

  public actualizar(filtros: Partial<FiltrosGlobales>): FiltrosGlobales {
    const actuales = this.estado();
    const actualizados = this.normalizar({
      fechaDesde: filtros.fechaDesde ?? actuales.fechaDesde,
      fechaHasta: filtros.fechaHasta ?? actuales.fechaHasta,
      codigosAlmacen: filtros.codigosAlmacen ?? actuales.codigosAlmacen,
    });
    this.estado.set(actualizados);
    guardarFiltrosSesion(claveFiltrosGlobales, actualizados);
    return this.obtener();
  }

  public reiniciar(): FiltrosGlobales {
    const fechaActual = obtenerFechaLocalActual();
    const filtros = { fechaDesde: fechaActual, fechaHasta: fechaActual, codigosAlmacen: [] };
    this.estado.set(filtros);
    guardarFiltrosSesion(claveFiltrosGlobales, filtros);
    return this.obtener();
  }

  private cargar(): FiltrosGlobales {
    const guardados = leerFiltrosSesion(claveFiltrosGlobales);
    return this.normalizar({
      fechaDesde: guardados['fechaDesde'],
      fechaHasta: guardados['fechaHasta'],
      codigosAlmacen: guardados['codigosAlmacen'],
    });
  }

  private normalizar(filtros: Record<string, unknown>): FiltrosGlobales {
    const fechaActual = obtenerFechaLocalActual();
    const codigos = Array.isArray(filtros['codigosAlmacen'])
      ? filtros['codigosAlmacen'].filter((codigo): codigo is string =>
        typeof codigo === 'string' && expresionAlmacen.test(codigo.trim()))
      : [];
    return {
      fechaDesde: esFechaCalendarioValida(filtros['fechaDesde'])
        ? filtros['fechaDesde'] : fechaActual,
      fechaHasta: esFechaCalendarioValida(filtros['fechaHasta'])
        ? filtros['fechaHasta'] : fechaActual,
      codigosAlmacen: [...new Set(codigos.map((codigo) => codigo.trim()))],
    };
  }
}
