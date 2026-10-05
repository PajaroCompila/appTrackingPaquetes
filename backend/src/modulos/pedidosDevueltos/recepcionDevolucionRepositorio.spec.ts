import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks=vi.hoisted(()=>({query:vi.fn(),begin:vi.fn(),commit:vi.fn(),rollback:vi.fn(),inputs:new Map<string,unknown>()}));
vi.mock('../../infraestructura/sql/conexionPedidosBodega.js',()=>({obtenerPoolPedidosBodega:()=>({request:()=>new Req()})}));
vi.mock('mssql',async importOriginal=>{
  const original=await importOriginal<{default:Record<string,unknown>}>();
  return {default:{...original.default,Request:class {input(n:string,_t:unknown,v:unknown){mocks.inputs.set(n,v);return this;}query(q:string){return mocks.query(q);}},
    Transaction:class {begin=mocks.begin;commit=mocks.commit;rollback=mocks.rollback;}}};
});
class Req {input(n:string,_t:unknown,v:unknown){mocks.inputs.set(n,v);return this;}query(q:string){return mocks.query(q);}}

import { RecepcionDevolucionRepositorio } from './recepcionDevolucionRepositorio.js';

beforeEach(()=>{vi.clearAllMocks();mocks.inputs.clear();mocks.query.mockResolvedValue({recordset:[]});});

describe('recepción física de devolución',()=>{
  it('guarda al receptor aparte y conserva la asignación de preparación',async()=>{
    mocks.query.mockResolvedValueOnce({recordset:[]}).mockResolvedValueOnce({recordset:[{
      idOrigen:'SAP:10',estadoOrigen:'CERRADO',usuarioRecibio:'gcruz',nombreRecibio:'Gregorio Cruz',
      recibidoEn:new Date('2026-10-05T15:00:00Z'),
    }]});
    const resultado=await new RecepcionDevolucionRepositorio().registrar('SAP:10',
      {usuario:'gcruz',nombre:'Gregorio Cruz'},'11111111-1111-1111-1111-111111111111');
    expect(resultado).toMatchObject({estadoOrigen:'CERRADO',nombreRecibio:'Gregorio Cruz'});
    const consulta=String(mocks.query.mock.calls[1]![0]);
    expect(consulta).toContain("estadoLocal='CERRADO'");
    expect(consulta).toContain('INSERT dbo.RecepcionDevolucionPedido');
    expect(consulta).not.toContain('AsignacionArticuloPedido');
    expect(mocks.commit).toHaveBeenCalledOnce();
  });

  it('evita registrar dos veces la misma devolución',async()=>{
    mocks.query.mockResolvedValueOnce({recordset:[]}).mockRejectedValueOnce(Object.assign(new Error('duplicado'),{number:51002}));
    await expect(new RecepcionDevolucionRepositorio().registrar('SAP:10',
      {usuario:'gcruz',nombre:'Gregorio Cruz'},'11111111-1111-1111-1111-111111111111'))
      .rejects.toMatchObject({estadoHttp:409,codigo:'DEVOLUCION_YA_RECIBIDA'});
    expect(mocks.rollback).toHaveBeenCalledOnce();
  });
});
