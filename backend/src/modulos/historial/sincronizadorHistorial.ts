import { HistorialServicio } from './historialServicio.js';
import { configuracion } from '../../configuracion/configuracion.js';

let temporizador: NodeJS.Timeout | undefined;
let activo = false;
let ejecutando = false;
let servicio: HistorialServicio | undefined;

function programarSiguiente(): void {
  if (!activo) return;
  temporizador = setTimeout(() => void ejecutar(), configuracion.intervaloSincronizacionHistorialMs);
  temporizador.unref();
}

async function ejecutar(): Promise<void> {
  if (!activo || ejecutando) return;
  ejecutando = true;
  try {
    const cantidad = await servicio!.sincronizar();
    if (cantidad > 0) {
      console.info(`Conciliación local completada: ${cantidad} pedidos actualizados.`);
    }
  } catch {
    console.error('No fue posible conciliar los pedidos despachados.');
  } finally {
    ejecutando = false;
    programarSiguiente();
  }
}

export function iniciarSincronizadorHistorial(): void {
  if (activo) return;
  servicio = new HistorialServicio();
  activo = true;
  void ejecutar();
}

export function detenerSincronizadorHistorial(): void {
  if (temporizador) clearTimeout(temporizador);
  temporizador = undefined;
  activo = false;
  servicio = undefined;
}
