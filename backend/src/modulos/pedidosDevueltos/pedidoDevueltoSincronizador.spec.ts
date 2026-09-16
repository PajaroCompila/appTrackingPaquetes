import { describe, expect, it, vi } from 'vitest';
import { PedidoDevueltoSincronizador, resolverCancelacionSap } from './pedidoDevueltoSincronizador.js';
import { claveEventoDevolucion, PedidoDevueltoRepositorio } from './pedidoDevueltoRepositorio.js';
const c={idPedidoDespachado:4,idOrigen:'SAP:8',origenPedido:'SAP' as const,folioPedido:null,sapDocEntry:'8'};
const d={DocEntry:8,folio:null,CANCELED:'Y',UpdateDate:new Date('2026-09-16T00:00:00Z'),UpdateTS:101230,tieneDocumentosPosteriores:0};
const fechaVerificada = new Date('2026-09-16T16:12:30.000Z');
describe('cancelaciones explícitas',()=>{
  it('no convierte un pedido cerrado pero no anulado en devolución',()=>expect(resolverCancelacionSap(c,[{...d,CANCELED:'N'}],fechaVerificada)).toBeNull());
  it('rechaza documentos que ya tienen salida formal o factura',()=>expect(resolverCancelacionSap(c,[{...d,tieneDocumentosPosteriores:1}],fechaVerificada)).toBeNull());
  it('requiere identificador exacto, no item, cliente o fecha',()=>expect(resolverCancelacionSap(c,[{...d,DocEntry:9}],fechaVerificada)).toBeNull());
  it('no resuelve relaciones ambiguas',()=>expect(resolverCancelacionSap({...c,origenPedido:'R1',folioPedido:'PE1'},[{...d,folio:'PE1'},{...d,DocEntry:9,folio:'PE1'}],fechaVerificada)).toBeNull());
  it('genera identidad estable para el mismo evento y distingue otro documento',()=>{
    const e=resolverCancelacionSap(c,[d],new Date('2026-09-16T16:12:30.000Z'))!;expect(e.motivo).toBe('Pedido cancelado');
    expect(e.fechaCancelacion.toISOString()).toBe('2026-09-16T16:12:30.000Z');
    expect(claveEventoDevolucion(4,e.evento)).toBe(claveEventoDevolucion(4,e.evento));
    expect(claveEventoDevolucion(5,e.evento)).not.toBe(claveEventoDevolucion(4,e.evento));
  });
  it('no usa la última actualización como fecha de cancelación sin evidencia',()=>{
    expect(resolverCancelacionSap(c,[d])).toBeNull();
    expect(resolverCancelacionSap(c,[d],new Date('invalid'))).toBeNull();
  });
  it('no añade consultas al ciclo mientras la fuente del evento no esté validada',async()=>{
    const repo = new PedidoDevueltoRepositorio();
    const candidatos = vi.spyOn(repo,'candidatos');
    const registrar = vi.spyOn(repo,'registrar');
    await new PedidoDevueltoSincronizador(repo).sincronizar();
    expect(candidatos).not.toHaveBeenCalled();
    expect(registrar).not.toHaveBeenCalled();
  });
});
