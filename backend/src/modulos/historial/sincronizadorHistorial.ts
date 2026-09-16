import { HistorialServicio } from './historialServicio.js';
import { configuracion } from '../../configuracion/configuracion.js';
import { EntregaSapSincronizador } from './entregaSapSincronizador.js';
import { ConciliacionEntregaPedido } from '../pedidos/conciliacionEntregaPedido.js';
import { PedidoDevueltoSincronizador } from '../pedidosDevueltos/pedidoDevueltoSincronizador.js';

let temporizador: NodeJS.Timeout | undefined;
let activo = false;
let ejecutando = false;
let servicio: HistorialServicio | undefined;
let servicioEntregas: EntregaSapSincronizador | undefined;
let servicioDevoluciones: PedidoDevueltoSincronizador | undefined;

function programarSiguiente(): void {
  if (!activo) return;
  temporizador = setTimeout(() => void ejecutar(), configuracion.intervaloSincronizacionHistorialMs);
  temporizador.unref();
}

async function ejecutar(): Promise<void> {
  if (!activo || ejecutando) return;
  ejecutando = true;
  try {
    const [pedidos, entregas] = await Promise.allSettled([
      servicio!.sincronizar(), servicioEntregas!.sincronizar(),
    ]);
    if (entregas.status === 'rejected') console.error('No fue posible actualizar las entregas SAP; se conserva el historial local.');
    try { await servicioDevoluciones?.sincronizar(); }
    catch { console.error('No fue posible revisar las devoluciones; se conserva la información local.'); }
    if (pedidos.status === 'rejected') throw pedidos.reason;
    const cantidad = pedidos.value;
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
  servicioEntregas = new EntregaSapSincronizador(undefined, undefined, new ConciliacionEntregaPedido());
  servicioDevoluciones = new PedidoDevueltoSincronizador();
  activo = true;
  void ejecutar();
}

export function detenerSincronizadorHistorial(): void {
  if (temporizador) clearTimeout(temporizador);
  temporizador = undefined;
  activo = false;
  servicio = undefined;
  servicioEntregas = undefined;
  servicioDevoluciones = undefined;
}
