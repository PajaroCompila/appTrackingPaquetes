import type { EstadoSalud } from './salud.interface.js';

function obtenerFechaHoraTegucigalpa(fecha: Date): string {
  const fechaLocal = new Date(fecha.getTime() - 6 * 60 * 60 * 1000);
  return fechaLocal.toISOString().replace('Z', '-06:00');
}

export class SaludServicio {
  public obtenerEstado(): EstadoSalud {
    return {
      estado: 'disponible',
      fechaHora: obtenerFechaHoraTegucigalpa(new Date()),
    };
  }
}

