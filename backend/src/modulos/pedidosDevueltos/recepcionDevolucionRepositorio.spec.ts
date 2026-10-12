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
      tipoRecepcion:'PERSONA',
      recibidoEn:new Date('2026-10-05T15:00:00Z'),
    }]});
    const resultado=await new RecepcionDevolucionRepositorio().registrar('SAP:10',
      {tipoRecepcion:'PERSONA',tecnico:{usuario:'gcruz',nombre:'Gregorio Cruz'}},
      '11111111-1111-1111-1111-111111111111');
    expect(resultado).toMatchObject({estadoOrigen:'CERRADO',tipoRecepcion:'PERSONA',
      nombreRecibio:'Gregorio Cruz'});
    const consulta=String(mocks.query.mock.calls[1]![0]);
    expect(consulta).toContain("estadoLocal='CERRADO'");
    expect(consulta).toContain('INSERT dbo.RecepcionDevolucionPedido');
    expect(consulta).not.toContain('AsignacionArticuloPedido');
    expect(mocks.commit).toHaveBeenCalledOnce();
  });

  it('persiste asignado a otro pedido sin crear ni guardar un usuario ficticio',async()=>{
    mocks.query.mockResolvedValueOnce({recordset:[]}).mockResolvedValueOnce({recordset:[{
      idOrigen:'SAP:10',estadoOrigen:'CANCELADO',tipoRecepcion:'ASIGNADO_OTRO_PEDIDO',
      usuarioRecibio:null,nombreRecibio:null,recibidoEn:new Date('2026-10-05T15:00:00Z'),
    }]});
    const resultado=await new RecepcionDevolucionRepositorio().registrar('SAP:10',
      {tipoRecepcion:'ASIGNADO_OTRO_PEDIDO'},'11111111-1111-1111-1111-111111111111');
    expect(resultado).toMatchObject({estadoOrigen:'CANCELADO',
      tipoRecepcion:'ASIGNADO_OTRO_PEDIDO',usuarioRecibio:null,nombreRecibio:null});
    expect(mocks.inputs.get('tipoRecepcion')).toBe('ASIGNADO_OTRO_PEDIDO');
    expect(mocks.inputs.get('usuarioRecibio')).toBeNull();
    expect(mocks.inputs.get('nombreRecibio')).toBeNull();
    const consulta=String(mocks.query.mock.calls[1]![0]);
    expect(consulta).toContain("h.canceled='Y' AND h.activo=1");
    expect(consulta).toContain("@tipoRecepcion='ASIGNADO_OTRO_PEDIDO' AND @cancelado=0");
  });

  it('evita registrar dos veces la misma devolución',async()=>{
    mocks.query.mockResolvedValueOnce({recordset:[]}).mockRejectedValueOnce(Object.assign(new Error('duplicado'),{number:51002}));
    await expect(new RecepcionDevolucionRepositorio().registrar('SAP:10',
      {tipoRecepcion:'PERSONA',tecnico:{usuario:'gcruz',nombre:'Gregorio Cruz'}},
      '11111111-1111-1111-1111-111111111111'))
      .rejects.toMatchObject({estadoHttp:409,codigo:'DEVOLUCION_YA_RECIBIDA'});
    expect(mocks.rollback).toHaveBeenCalledOnce();
  });

  it('rechaza la opción especial si el backend no confirma cancelación',async()=>{
    mocks.query.mockResolvedValueOnce({recordset:[]})
      .mockRejectedValueOnce(Object.assign(new Error('no cancelado'),{number:51003}));
    await expect(new RecepcionDevolucionRepositorio().registrar('SAP:10',
      {tipoRecepcion:'ASIGNADO_OTRO_PEDIDO'},'11111111-1111-1111-1111-111111111111'))
      .rejects.toMatchObject({estadoHttp:409,codigo:'RECEPCION_ESPECIAL_NO_PERMITIDA'});
  });
});
