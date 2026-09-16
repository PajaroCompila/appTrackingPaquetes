import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({query:vi.fn(),begin:vi.fn(),commit:vi.fn(),rollback:vi.fn(),inputs:new Map<string,unknown>()}));
vi.mock('../../infraestructura/sql/conexionPedidosBodega.js',()=>({obtenerPoolPedidosBodega:()=>({request:()=>new Req()})}));
vi.mock('mssql',async importOriginal=>{
  const original=await importOriginal<{default:Record<string,unknown>}>();
  return {default:{...original.default,Request:class {input(n:string,_t:unknown,v:unknown){mocks.inputs.set(n,v);return this;}query(q:string){return mocks.query(q);}},
    Transaction:class {begin=mocks.begin;commit=mocks.commit;rollback=mocks.rollback;}}};
});
class Req {input(n:string,_t:unknown,v:unknown){mocks.inputs.set(n,v);return this;}query(q:string){return mocks.query(q);}}
import { PedidoDevueltoRepositorio } from './pedidoDevueltoRepositorio.js';
const usuario={usuarioId:'11111111-1111-1111-1111-111111111111',nombreUsuario:'ana',nombreVisible:'Ana',codigoRol:'OPERADOR_BODEGA',codigoAlmacen:null,codigosAlmacenVisibles:['BSPS03'],sesionId:'1',debeCambiarContrasena:false};
beforeEach(()=>{vi.clearAllMocks();mocks.inputs.clear();mocks.query.mockResolvedValue({recordset:[]});});
describe('persistencia y recepción',()=>{
  it('rechaza bodega ajena y no realiza escrituras',async()=>{
    mocks.query.mockResolvedValue({recordset:[{idClave:'a',identificadorDetalle:'1',codigoAlmacen:'BSPS02'}]});
    await expect(new PedidoDevueltoRepositorio().confirmar([{idClave:'a',identificadorDetalle:'1'}],usuario)).rejects.toMatchObject({estadoHttp:403});
    expect(mocks.query).toHaveBeenCalledTimes(1);expect(mocks.rollback).toHaveBeenCalledOnce();expect(mocks.commit).not.toHaveBeenCalled();
  });
  it('consulta no puede confirmar y ni abre transacción',async()=>{
    await expect(new PedidoDevueltoRepositorio().confirmar([{idClave:'a',identificadorDetalle:'1'}],{...usuario,codigoRol:'CONSULTA'})).rejects.toMatchObject({estadoHttp:403});
    expect(mocks.begin).not.toHaveBeenCalled();
  });
  it('operador sin bodegas autorizadas no puede confirmar',async()=>{
    mocks.query.mockResolvedValue({recordset:[{idClave:'a',identificadorDetalle:'1',codigoAlmacen:'BSPS03'}]});
    await expect(new PedidoDevueltoRepositorio().confirmar([{idClave:'a',identificadorDetalle:'1'}],{...usuario,codigosAlmacenVisibles:[]})).rejects.toMatchObject({estadoHttp:403});
    expect(mocks.query).toHaveBeenCalledTimes(1);expect(mocks.commit).not.toHaveBeenCalled();
  });
  it('admin recibe cualquier bodega, conserva primera recepción y actualiza conteos sin mover inventario',async()=>{
    mocks.query.mockResolvedValueOnce({recordset:[{idClave:'a',identificadorDetalle:'1',codigoAlmacen:'TCIR01'}]}).mockResolvedValueOnce({});
    await new PedidoDevueltoRepositorio().confirmar([{idClave:'a',identificadorDetalle:'1'}],{...usuario,codigoRol:'ADMINISTRADOR'});
    expect(mocks.inputs.get('usuario')).toBe(usuario.usuarioId);expect(mocks.commit).toHaveBeenCalledOnce();
    const q=mocks.query.mock.calls[1]![0] as string;
    expect(q).toContain('WHERE d.recibidoEn IS NULL');expect(q).toContain("N'DEVOLUCIÓN PARCIAL'");expect(q).toContain('fechaDevolucionCompleta');
    expect(q).not.toMatch(/OITW|ServiceLayer|Retail One|ORDR|OINV|ODLN/);
  });
  it('registra solamente snapshot local, guardia sin despacho y sin duplicar ni reconstruir artículos actuales',async()=>{
    await new PedidoDevueltoRepositorio().registrar({idPedidoDespachado:4,evento:'SAP:17:8:CANCELED:Y',motivo:'Pedido cancelado',fechaCancelacion:new Date(),evidencia:{CANCELED:'Y'}});
    const q=mocks.query.mock.calls[0]![0] as string;
    expect(q).toContain('IF NOT EXISTS');expect(q).toContain('UPDLOCK,HOLDLOCK');expect(q).toContain('FROM dbo.PedidoDespachadoDetalle');
    expect(q).toContain("p.estadoLocal IN('DESPACHADO','CERRADO')");expect(q).toContain('p.validadoDetectadoEn IS NULL');
    expect(q).not.toMatch(/\[@SO1|OITW|RDR1|ORDR/);expect(q).toContain('p.nombreVendedor,p.despachadoEn');
  });
  it('confirmación múltiple valida todas las líneas antes de escribir y aborta si falta una',async()=>{
    mocks.query.mockResolvedValueOnce({recordset:[]});
    await expect(new PedidoDevueltoRepositorio().confirmar([{idClave:'a',identificadorDetalle:'1'}],usuario)).rejects.toMatchObject({estadoHttp:404});
    expect(mocks.query).toHaveBeenCalledTimes(1);expect(mocks.rollback).toHaveBeenCalledOnce();
  });
});
