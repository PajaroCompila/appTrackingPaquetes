import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ControlOperativoFinanciero } from './controlOperativoFinanciero.js';
import { ControlOperativoSincronizador } from './controlOperativoSincronizador.js';
import type { ControlOperativoRepositorio } from './controlOperativoRepositorio.js';
import { CONDICION_HISTORIAL_R1 } from '../historial/historialR1Repositorio.js';
const mocks=vi.hoisted(()=>({local:vi.fn(),origen:vi.fn(),pool:vi.fn()}));
vi.mock('../../infraestructura/sql/conexionPedidosBodega.js',()=>({obtenerPoolPedidosBodega:()=>({
  request:()=>({input:vi.fn().mockReturnThis(),query:mocks.local}),
})}));
vi.mock('../../infraestructura/sql/conexionSucursalesR1.js',()=>({
  obtenerSucursalesR1:()=>[{codigoTienda:'TSPS01'},{codigoTienda:'TTGU01'}],
  obtenerPoolSucursalR1:mocks.pool,
}));
beforeEach(()=> {
  vi.clearAllMocks();mocks.local.mockResolvedValue({recordset:[]});mocks.origen.mockResolvedValue({recordset:[]});
  mocks.pool.mockResolvedValue({request:()=>({input:vi.fn().mockReturnThis(),query:mocks.origen})});
});
describe('estado financiero de Historial sin cambiar sus criterios',()=> {
  it('consulta R1 por lotes con el mismo predicado de Historial, sin exigir STATUS=C',async()=> {
    mocks.origen.mockResolvedValue({recordset:[{folio:'PE1',numeroPedido:'100',nombreVendedor:'Vendedor',fechaHoraPedido:'2026-09-18T08:00:00'}]});
    const r=await new ControlOperativoFinanciero().estados(['R1:TSPS01:PE1','R1:TSPS01:PE2']);
    expect(r).toEqual(expect.arrayContaining([{idOrigen:'R1:TSPS01:PE1',facturado:true,fuente:'HISTORIAL_R1_VERIFICADO',
      cabecera:{numeroPedido:'100',nombreVendedor:'Vendedor',fechaHoraPedido:'2026-09-18T08:00:00'}},
    {idOrigen:'R1:TSPS01:PE2',facturado:false,fuente:'HISTORIAL_R1_VERIFICADO'}]));
    expect(mocks.pool).toHaveBeenCalledTimes(1);expect(mocks.origen).toHaveBeenCalledTimes(1);
    const consulta=mocks.origen.mock.calls[0]![0];expect(consulta).toContain(CONDICION_HISTORIAL_R1);
    expect(consulta).not.toContain('U_SO1_STATUS');expect(consulta).not.toMatch(/\b(INSERT|UPDATE|DELETE|MERGE|EXEC)\b/i);
  });
  it('sucursal caída conserva el estado anterior y permite avanzar revisión sin perder otras sucursales',async()=> {
    mocks.pool.mockImplementation(async(c:{codigoTienda:string})=> {
      if(c.codigoTienda==='TSPS01') throw new Error('offline');
      return {request:()=>({input:vi.fn().mockReturnThis(),query:mocks.origen})};
    });
    const r=await new ControlOperativoFinanciero().estados(['R1:TSPS01:PE1','R1:TTGU01:PE2']);
    expect(r).toEqual(expect.arrayContaining([{idOrigen:'R1:TSPS01:PE1',facturado:null,fuente:null},
      {idOrigen:'R1:TTGU01:PE2',facturado:false,fuente:'HISTORIAL_R1_VERIFICADO'}]));
  });
  it('consume Facturado local de entregas SAP con base/conciliación, sin consultar SAP por línea',async()=> {
    mocks.local.mockResolvedValue({recordset:[{idOrigen:'SAP:200',fuente:'HISTORIAL_ENTREGA_SAP',cabecera:'{}'}]});
    expect(await new ControlOperativoFinanciero().estados(['SAP:200'])).toEqual([
      {idOrigen:'SAP:200',facturado:true,fuente:'HISTORIAL_ENTREGA_SAP'}]);
    expect(mocks.origen).not.toHaveBeenCalled();expect(mocks.pool).not.toHaveBeenCalled();
    const consulta=mocks.local.mock.calls[0]![0];expect(consulta).toContain("h.estadoFinanciero=N'Facturado'");
    expect(consulta).toContain('l.baseType=17');expect(consulta).toContain('c.idPedido=i.value');
    expect(consulta).not.toMatch(/\b(INSERT|UPDATE|DELETE|MERGE|EXEC)\b/i);
  });
  it('no consulta fuentes si no hay candidatos',async()=> {
    expect(await new ControlOperativoFinanciero().estados([])).toEqual([]);expect(mocks.local).not.toHaveBeenCalled();
  });
  it('un SAP cerrado sin estado financiero explícito no se inventa como Facturado',async()=> {
    mocks.local.mockResolvedValue({recordset:[{idOrigen:'SAP:200',fuente:'',cabecera:'{}'}]});
    expect(await new ControlOperativoFinanciero().estados(['SAP:200'])).toEqual([
      {idOrigen:'SAP:200',facturado:false,fuente:'HISTORIAL_ENTREGA_SAP'}]);
    expect(mocks.local.mock.calls[0]![0]).not.toContain('PedidoSapHistorial');
    expect(mocks.local.mock.calls[0]![0]).not.toContain("estadoLocal='VALIDADO'");
  });
  it('500 candidatos de una sucursal siguen siendo una consulta externa, no N+1',async()=> {
    await new ControlOperativoFinanciero().estados(Array.from({length:500},(_,i)=>`R1:TSPS01:PE${i}`));
    expect(mocks.origen).toHaveBeenCalledTimes(1);
  });
  it('cabeceras ambiguas no eligen vendedor, número ni un nuevo estado financiero',async()=> {
    mocks.origen.mockResolvedValue({recordset:[{folio:'PE1',numeroPedido:'100'},{folio:'PE1',numeroPedido:'200'}]});
    expect(await new ControlOperativoFinanciero().estados(['R1:TSPS01:PE1'])).toEqual([
      {idOrigen:'R1:TSPS01:PE1',facturado:null,fuente:null}]);
  });
});
describe('sincronizador operativo independiente',()=> {
  it('sin migración retorna sin tocar estados',async()=> {
    const repo={disponible:vi.fn().mockResolvedValue(false),candidatosFinancieros:vi.fn(),guardarEstados:vi.fn()};
    const financiero={estados:vi.fn()};
    await new ControlOperativoSincronizador(repo as unknown as ControlOperativoRepositorio,financiero).sincronizar();
    expect(repo.candidatosFinancieros).not.toHaveBeenCalled();expect(financiero.estados).not.toHaveBeenCalled();
  });
  it('evita ciclos concurrentes y guarda solo en repositorio local',async()=> {
    let resolver!:(v:boolean)=>void;
    const repo={disponible:vi.fn(()=>new Promise<boolean>(r=>resolver=r)),
      candidatosFinancieros:vi.fn().mockResolvedValue([{idOrigen:'SAP:1'}]),guardarEstados:vi.fn()};
    const financiero={estados:vi.fn().mockResolvedValue([{idOrigen:'SAP:1',facturado:true,fuente:'HISTORIAL_ENTREGA_SAP'}])};
    const s=new ControlOperativoSincronizador(repo as unknown as ControlOperativoRepositorio,financiero);
    const primero=s.sincronizar();await s.sincronizar();expect(repo.disponible).toHaveBeenCalledTimes(1);
    resolver(true);await primero;expect(repo.guardarEstados).toHaveBeenCalledWith([{idOrigen:'SAP:1',facturado:true,fuente:'HISTORIAL_ENTREGA_SAP'}]);
  });
});
