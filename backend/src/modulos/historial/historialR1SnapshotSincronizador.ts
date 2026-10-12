import type { FiltrosHistorial, PedidoHistorial } from './historial.interface.js';
import { HistorialR1Repositorio } from './historialR1Repositorio.js';
import { HistorialR1SnapshotRepositorio } from './historialR1SnapshotRepositorio.js';
import { ReferenciaPedidoSapR1Conciliador } from './referenciaPedidoSapR1Conciliador.js';
import { marcarCambioProyeccionHistorialR1 } from './historialCacheVersion.js';

const cantidadPaginaSincronizacion = 100;
const vigenciaSincronizacionMs = 45_000;

function fechaActualHonduras(ahora = new Date()): string {
  return new Date(ahora.getTime() - 6 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export class HistorialR1SnapshotSincronizador {
  private readonly enCurso = new Map<string, Promise<number>>();
  private readonly ultimaSincronizacion = new Map<string, number>();

  public constructor(
    private readonly fuente = new HistorialR1Repositorio(),
    private readonly destino = new HistorialR1SnapshotRepositorio(),
    private readonly ahora: () => number = Date.now,
    private readonly conciliadorSap = new ReferenciaPedidoSapR1Conciliador(),
  ) {}

  public sincronizarHoy(): Promise<number> {
    const fecha = fechaActualHonduras(new Date(this.ahora()));
    return this.sincronizar(fecha, fecha);
  }

  public sincronizar(fechaDesde: string, fechaHasta: string): Promise<number> {
    const clave = `${fechaDesde}\u0000${fechaHasta}`;
    const existente = this.enCurso.get(clave);
    if (existente) return existente;
    if (this.ahora() - (this.ultimaSincronizacion.get(clave) ?? 0) < vigenciaSincronizacionMs) {
      return Promise.resolve(0);
    }
    const promesa = this.ejecutar(fechaDesde, fechaHasta).finally(() => this.enCurso.delete(clave));
    this.enCurso.set(clave, promesa);
    return promesa;
  }

  private async ejecutar(fechaDesde: string, fechaHasta: string): Promise<number> {
    const registros: PedidoHistorial[] = [];
    let pagina = 1;
    let completo = true;
    while (true) {
      const resultado = await this.fuente.buscar({
        fechaDesde,
        fechaHasta,
        codigosAlmacen: [],
        pagina,
        cantidadPorPagina: cantidadPaginaSincronizacion,
      });
      registros.push(...resultado.registros);
      completo &&= !(resultado.advertenciasFuentes?.length);
      if (!resultado.hayMas) break;
      pagina += 1;
    }
    const conciliacion = await this.conciliadorSap.conciliar(registros);
    if (conciliacion.ambiguos.length > 0) {
      console.error(`Folios R1 con relación SAP ambigua: ${conciliacion.ambiguos.join(', ')}.`);
    }
    if (conciliacion.nuevos > 0) {
      console.info(`Conciliación SAP/R1 completada: ${conciliacion.nuevos} referencias nuevas.`);
    }
    await this.destino.guardarRango(fechaDesde, fechaHasta, conciliacion.registros, completo);
    if (conciliacion.nuevos > 0) marcarCambioProyeccionHistorialR1();
    if (completo) this.ultimaSincronizacion.set(`${fechaDesde}\u0000${fechaHasta}`, this.ahora());
    return registros.length;
  }
}

let sincronizadorActivo: HistorialR1SnapshotSincronizador | null = null;

export function activarSincronizadorHistorialR1(
  sincronizador = new HistorialR1SnapshotSincronizador(),
): HistorialR1SnapshotSincronizador {
  sincronizadorActivo = sincronizador;
  return sincronizador;
}

export function desactivarSincronizadorHistorialR1(): void {
  sincronizadorActivo = null;
}

export function solicitarSincronizacionHistorialR1(filtros: FiltrosHistorial): void {
  void sincronizadorActivo?.sincronizar(filtros.fechaDesde, filtros.fechaHasta).catch(() =>
    console.error('No fue posible actualizar la proyección local de Historial R1.'));
}

export { fechaActualHonduras };
