import { HistorialServicio } from './historialServicio.js';

let temporizador: NodeJS.Timeout | undefined;

export function iniciarSincronizadorHistorial(): void {
  const servicio = new HistorialServicio();
  const ejecutar = async (): Promise<void> => {
    try {
      const cantidad = await servicio.sincronizar();
      console.info(`Conciliación local completada: ${cantidad} pedidos actualizados.`);
    } catch {
      console.error('No fue posible conciliar los pedidos despachados.');
    }
  };
  void ejecutar();
  temporizador = setInterval(() => void ejecutar(), 5 * 1000);
  temporizador.unref();
}

export function detenerSincronizadorHistorial(): void {
  if (temporizador) clearInterval(temporizador);
  temporizador = undefined;
}
