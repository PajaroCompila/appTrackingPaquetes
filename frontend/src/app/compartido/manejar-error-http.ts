import { HttpErrorResponse } from '@angular/common/http';
import type { ErrorApi, MensajeError } from './error-api.interface';

export function obtenerMensajeError(
  error: unknown,
  contexto: 'listado' | 'detalle' | 'historial',
): MensajeError {
  if (!(error instanceof HttpErrorResponse)) {
    return { titulo: 'Algo salió mal', detalle: 'Probá de nuevo.' };
  }

  const errorApi = typeof error.error === 'object' && error.error !== null
    ? error.error as ErrorApi
    : {};
  const idSeguimiento = errorApi.idSeguimiento;

  if (error.status === 400) {
    return {
      titulo: 'Revisá los filtros',
      detalle: 'Hay un dato que no es válido.',
      idSeguimiento,
    };
  }
  if (error.status === 404 && contexto === 'detalle') {
    return {
      titulo: 'Pedido no encontrado',
      detalle: 'Este pedido no existe o ya no está disponible.',
      idSeguimiento,
    };
  }
  if (error.status === 503) {
    return {
      titulo: 'El sistema no responde',
      detalle: 'Esperá un momento y probá de nuevo.',
      idSeguimiento,
    };
  }
  return {
    titulo: 'No pudimos cargar los datos',
    detalle: 'Probá de nuevo. Si sigue igual, avisá a Sistemas.',
    idSeguimiento,
  };
}
