import type { FiltrosHistorial, PedidoHistorial } from './historial.interface.js';
import { HistorialR1Repositorio } from './historialR1Repositorio.js';
import { HistorialR1SnapshotRepositorio } from './historialR1SnapshotRepositorio.js';

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
    await this.destino.guardarRango(fechaDesde, fechaHasta, registros, completo);
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
