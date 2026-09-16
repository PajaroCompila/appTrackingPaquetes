import sql from 'mssql';
import { consultarSap } from '../../infraestructura/sql/consultaSap.js';
import { PedidoDevueltoRepositorio, type CandidatoDevolucion, type EventoDevolucion } from './pedidoDevueltoRepositorio.js';

interface CancelacionSap {
  DocEntry: number; folio: string | null; CANCELED: string;
  UpdateDate: Date; UpdateTS: number; tieneDocumentosPosteriores: number;
}
export function resolverCancelacionSap(c: CandidatoDevolucion, documentos: CancelacionSap[], fechaCancelacionVerificada?: Date): EventoDevolucion | null {
  const encontrados = documentos.filter(d => c.origenPedido === 'SAP'
    ? String(d.DocEntry) === c.sapDocEntry : Boolean(c.folioPedido) && d.folio === c.folioPedido);
  if (encontrados.length !== 1) return null;
  const d = encontrados[0]!;
  if (d.CANCELED !== 'Y' || d.tieneDocumentosPosteriores) return null;
  // UpdateDate/UpdateTS indican la última modificación, no prueban cuándo se canceló.
  // Sin una fecha del evento verificada no es seguro ordenar cancelación y despacho.
  if (!fechaCancelacionVerificada || !Number.isFinite(fechaCancelacionVerificada.getTime())) return null;
  const fechaCancelacion = new Date(fechaCancelacionVerificada);
  return { idPedidoDespachado: c.idPedidoDespachado, evento: `SAP:17:${d.DocEntry}:CANCELED:Y`,
    motivo: 'Pedido cancelado',fechaCancelacion,
    evidencia: { fuente: 'ORDR',DocEntry:d.DocEntry,CANCELED:d.CANCELED,UpdateDate:d.UpdateDate,UpdateTS:d.UpdateTS,folio:d.folio } };
}

// F5/R1 y anulación de factura: no se infieren de DocStatus=C; requieren evidencia validada.
// La detección queda bloqueada hasta verificar el evento y su fecha en la fuente.
// CANCELED=Y identifica anulación, pero por sí solo no acredita que ocurrió después del despacho.
export class PedidoDevueltoSincronizador {
  constructor(private readonly repo = new PedidoDevueltoRepositorio(),
    private readonly consultarFechaEventoVerificada?: (candidato: CandidatoDevolucion) => Promise<Date | null>) {}
  public async sincronizar(): Promise<void> {
    // No añadir consultas de fuente al ciclo mientras falte validar el evento operativo.
    if (!this.consultarFechaEventoVerificada) return;
    const candidatos = await this.repo.candidatos();
    if (!candidatos.length) { await this.repo.avanzar(0); return; }
    const requestParams = (r: sql.Request): sql.Request => {
      candidatos.forEach((c,i) => r.input(`entry${i}`,sql.Int,c.origenPedido==='SAP' && /^\d+$/.test(c.sapDocEntry ?? '') ? Number(c.sapDocEntry) : null)
        .input(`folio${i}`,sql.NVarChar(100),c.origenPedido==='R1'?c.folioPedido:null));
      return r;
    };
    const result = await consultarSap<CancelacionSap>(`SELECT o.DocEntry,o.U_SO1_01FOLIORETAIL1 folio,o.CANCELED,o.UpdateDate,o.UpdateTS,
      CASE WHEN EXISTS(SELECT 1 FROM DLN1 d WHERE d.BaseType=17 AND d.BaseEntry=o.DocEntry)
        OR EXISTS(SELECT 1 FROM INV1 i WHERE i.BaseType=17 AND i.BaseEntry=o.DocEntry) THEN 1 ELSE 0 END tieneDocumentosPosteriores
      FROM ORDR o WHERE o.DocEntry IN(${candidatos.map((_,i)=>`@entry${i}`).join(',')})
        OR o.U_SO1_01FOLIORETAIL1 IN(${candidatos.map((_,i)=>`@folio${i}`).join(',')})`,requestParams);
    for (const c of candidatos) {
      const fecha = await this.consultarFechaEventoVerificada(c);
      const e = resolverCancelacionSap(c,result.recordset,fecha ?? undefined);
      if (e) await this.repo.registrar(e);
    }
    await this.repo.avanzar(candidatos[candidatos.length-1]!.idPedidoDespachado);
  }
}
