import { EntregaSapFuente } from './entregaSapFuente.js';
import { EntregaSapRepositorio } from './entregaSapRepositorio.js';
import type { EntregaSapPersistida } from './entregaSap.interface.js';
import type { ConciliacionEntregaPedido } from '../pedidos/conciliacionEntregaPedido.js';

export class EntregaSapSincronizador {
  private enCurso: Promise<number> | null = null;
  public constructor(private readonly fuente = new EntregaSapFuente(),
    private readonly repositorio = new EntregaSapRepositorio(),
    private readonly conciliacion?: Pick<ConciliacionEntregaPedido, 'sincronizar'>) {}

  public async sincronizar(): Promise<number> {
    if (this.enCurso) return this.enCurso;
    this.enCurso = this.ciclo();
    try { return await this.enCurso; } finally { this.enCurso = null; }
  }

  private async ciclo(): Promise<number> {
    const control = await this.repositorio.control();
    const [nuevas, anteriores, revision] = await Promise.all([
      this.fuente.descubrir(control.ultimoDocEntry),
      control.anteriorDocEntry > 0 ? this.fuente.descubrir(control.anteriorDocEntry, 25, true) : Promise.resolve([]),
      this.repositorio.conocidas(control.revisionDocEntry),
    ]);
    const facturas = await this.fuente.descubrirFacturas(control.ultimaFacturaDocEntry);
    const ids = [...new Set([...nuevas, ...anteriores, ...revision,
      ...facturas.flatMap(f => f.entregaDocEntry === null ? [] : [f.entregaDocEntry])])];
    const entregas: EntregaSapPersistida[] = [];
    for (let inicio = 0; inicio < ids.length; inicio += 150) {
      entregas.push(...await this.fuente.obtener(ids.slice(inicio,inicio+150)));
    }
    // Nunca avanzar el cursor con un lote incompleto: conserva los datos y reintenta.
    if (ids.some(id => !entregas.some(e => e.docEntry === id))) {
      throw new Error('SAP devolvió un lote de entregas incompleto.');
    }
    await this.repositorio.guardar(entregas, {
      ultimoDocEntry: Math.max(control.ultimoDocEntry, ...nuevas),
      anteriorDocEntry: control.ultimoDocEntry === 0 && nuevas.length ? Math.min(...nuevas)
        : anteriores.length ? Math.min(...anteriores) : control.anteriorDocEntry > 0 ? 0 : control.anteriorDocEntry,
      revisionDocEntry: revision.length ? Math.max(...revision) : 0,
      ultimaFacturaDocEntry: Math.max(control.ultimaFacturaDocEntry,...facturas.map(f => f.facturaDocEntry)),
    }, control);
    if (this.conciliacion) await this.conciliacion.sincronizar(entregas);
    return entregas.length;
  }
}
