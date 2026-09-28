import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CancelacionSapHistorial, convertirCancelaciones, CONSULTA_CANCELACIONES_SAP, type FilaCanceladaSap } from './cancelacionSapHistorial.js';
import type { consultarSap } from '../../infraestructura/sql/consultaSap.js';

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../../infraestructura/sql/conexionPedidosBodega.js', () => ({
  obtenerPoolPedidosBodega: () => ({ request: () => ({ input: function() { return this; }, query }) }),
}));
const fila: FilaCanceladaSap = { docEntry:1,numeroPedido:'101471323',folioPedido:null,
  fechaPedido:new Date('2026-09-02T00:00:00Z'),horaPedido:919,canceled:'Y',docStatus:'C',nombreVendedor:'Vendedor',
  linea:0,codigoArticulo:'A',descripcion:'Articulo',cantidad:2,codigoAlmacen:'BSPS04' };
const filtros = {codigosAlmacen:[],estado:'todos' as const,vista:'pedido' as const,pagina:1,cantidadPorPagina:25};

beforeEach(() => { query.mockReset().mockResolvedValue({recordset:[]}); });

describe('historial exclusivo de cancelaciones SAP', () => {
  it('solo admite Y, no cerrados, abiertos ni documentos de cancelacion C', () => {
    const pedidos = convertirCancelaciones(['N','C','Y','CANCEL',''].map((canceled,i)=>({...fila,docEntry:i,canceled})));
    expect(pedidos).toHaveLength(1);
    expect(pedidos[0]?.estado).toBe('CANCEL');
    expect(CONSULTA_CANCELACIONES_SAP).toContain("WHERE o.CANCELED='Y'");
    expect(CONSULTA_CANCELACIONES_SAP).not.toContain("DocStatus='C'");
  });
  it('no exige despacho local ni inventa fecha de cancelacion o recepcion', () => {
    const p = convertirCancelaciones([fila])[0]!;
    expect(p.fechaHoraPedido).toBe('2026-09-02T15:19:00.000Z');
    expect(p.fechaCancelacion).toBeNull();
    expect(p.fechaDespacho).toBeNull();
    expect(p.fueDespachado).toBe(false);
    expect(p.lineas[0]?.estado).toBe('CANCEL');
    expect(p.lineas[0]?.recibidoEn).toBeUndefined();
  });
  it('agrupa por DocEntry, evita duplicados y conserva pedidos sin lineas', () => {
    const p = convertirCancelaciones([fila,fila,{...fila,linea:1},{...fila,docEntry:2,linea:null}]);
    expect(p).toHaveLength(2);expect(p[0]?.lineas).toHaveLength(2);expect(p[1]?.lineas).toHaveLength(0);
    expect(convertirCancelaciones([fila])[0]?.idClave).toBe(p[0]?.idClave);
  });
  it('conserva el historial si SAP esta fuera de linea', async () => {
    const p = convertirCancelaciones([fila])[0]!;
    query.mockImplementation(async (s:string) => s.includes('COUNT(*)') ? {recordset:[{cantidad:1}]}
      : s.includes('SELECT snapshot') ? {recordset:[{snapshot:JSON.stringify(p)}]} : {recordset:[]});
    const fuente = vi.fn().mockRejectedValue(new Error('SAP desconectado'));
    const r = await new CancelacionSapHistorial(fuente as typeof consultarSap).listar(filtros);
    expect(r.datos[0]?.numeroPedido).toBe('101471323');
    expect(query.mock.calls.every(([q])=>!/DELETE|TRUNCATE/.test(q))).toBe(true);
  });
  it('filtra bodegas antes de paginar articulos y excluye cualquier snapshot no CANCEL', async () => {
    const p = convertirCancelaciones([fila,{...fila,linea:1,codigoAlmacen:'BSPS02'}])[0]!;
    query.mockImplementation(async(s:string)=> s.includes('SELECT snapshot') ? {recordset:[
      {snapshot:JSON.stringify(p)},{snapshot:JSON.stringify({...p,estado:'DEVUELTO'})}]} : {recordset:[]});
    const fuente = vi.fn().mockResolvedValue({recordset:[]});
    const r = await new CancelacionSapHistorial(fuente as typeof consultarSap).listar({...filtros,codigosAlmacen:['BSPS02'],vista:'articulos'});
    expect(r.total).toBe(1);expect(r.datos[0]?.lineas[0]?.codigoAlmacen).toBe('BSPS02');
  });
  it('persiste con identidad unica y sin borrar snapshots anteriores', async () => {
    const fuente=vi.fn().mockResolvedValue({recordset:[fila]});
    await new CancelacionSapHistorial(fuente as typeof consultarSap).sincronizar();
    const insercion=query.mock.calls.map(([q])=>String(q)).find(q=>q.includes('INSERT dbo.CancelacionSapHistorial'))!;
    expect(insercion).toContain('WHERE NOT EXISTS');expect(insercion).toContain('UPDLOCK,HOLDLOCK');
    expect(insercion).not.toMatch(/DELETE|TRUNCATE/);
  });
});
