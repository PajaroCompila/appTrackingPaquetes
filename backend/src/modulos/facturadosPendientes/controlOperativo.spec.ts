import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ControlOperativoRepositorio } from './controlOperativoRepositorio.js';
import { MIGRACION_CONTROL_OPERATIVO } from './controlOperativoMigracion.js';
import { versionLineaFisica } from './controlOperativoModelo.js';
import type { FiltrosControlOperativo } from './controlOperativo.interface.js';
import type { IdentidadAutenticada } from '../autenticacion/autenticacion.interface.js';

const mocks=vi.hoisted(()=>({query:vi.fn(),begin:vi.fn(),commit:vi.fn(),rollback:vi.fn()}));
vi.mock('../../infraestructura/sql/conexionPedidosBodega.js',()=>({
  obtenerPoolPedidosBodega:()=>({request:()=>({input:vi.fn().mockReturnThis(),query:mocks.query})}),
}));
vi.mock('mssql',async original=> {
  const actual=await original<typeof import('mssql') & {default:typeof import('mssql')}>();
  return {...actual,default:{...actual.default,
    Transaction:class {begin=mocks.begin;commit=mocks.commit;rollback=mocks.rollback;},
    Request:class {input(){return this;}query=mocks.query;},
  }};
});
const id='R1:TSPS01:PRUEBA';
const cabecera=JSON.stringify({numeroPedido:'101475000',nombreVendedor:'Vendedor',fechaHoraPedido:'2026-09-18T08:00:00'});
const filtro:FiltrosControlOperativo={codigosAlmacen:[],pagina:1,cantidadPorPagina:25,vista:'articulos'};
const usuario:IdentidadAutenticada={usuarioId:'user',nombreUsuario:'operador',nombreVisible:'Operador',
  codigoRol:'OPERADOR_BODEGA',codigoAlmacen:null,sesionId:'s',debeCambiarContrasena:false};
function fila(partida:string,modoControl:'MANUAL'|'SIN_VALIDACION_MANUAL'|null='MANUAL',cantidadDespachada=0) {
  return {idOrigen:id,cabecera,identificadorDetalle:partida,codigoArticulo:'ABC',descripcion:'Producto',cantidad:1,
    codigoAlmacen:'BODEGA',modoControl,cantidadDespachada,nombreAsignado:null,responsableConfigurado:'Responsable',
    usuarioAsignado:null,versionesConfirmadas:null as string|null};
}
beforeEach(()=> {vi.clearAllMocks();mocks.query.mockResolvedValue({recordset:[]});});
describe('facturados pendientes: casos de aceptación y snapshots locales',()=> {
  it('A: todas las líneas manuales despachadas no generan cola',async()=> {
    mocks.query.mockResolvedValue({recordset:[fila('1','MANUAL',1),fila('2','MANUAL',1)]});
    expect(await new ControlOperativoRepositorio().listar(filtro)).toEqual({datos:[],total:0});
  });
  it('B: 7 líneas, 6 sin validación, muestra solamente la séptima pendiente',async()=> {
    mocks.query.mockResolvedValue({recordset:[...Array.from({length:6},(_,i)=>fila(String(i+1),'SIN_VALIDACION_MANUAL')),fila('7')]});
    const r=await new ControlOperativoRepositorio().listar({...filtro,vista:'pedido'});
    expect(r.datos[0]).toMatchObject({totalArticulos:7,controladosManualmente:1,confirmados:0,pendientes:1,
      sinValidacionManual:6,estadoFinanciero:'Facturado',estadoOperativo:'Entrega pendiente'});
    expect(r.datos[0]!.lineas.map(l=>l.identificadorDetalle)).toEqual(['7']);
  });
  it('C: cinco líneas sin validación no generan bloqueo ni Entregado',async()=> {
    mocks.query.mockResolvedValue({recordset:Array.from({length:5},(_,i)=>fila(String(i),'SIN_VALIDACION_MANUAL'))});
    expect(await new ControlOperativoRepositorio().listar(filtro)).toEqual({datos:[],total:0});
  });
  it('D: mixto manual confirmado/pendiente y dos sin validación muestra solamente B',async()=> {
    mocks.query.mockResolvedValue({recordset:[fila('1','MANUAL',1),fila('2'),fila('3','SIN_VALIDACION_MANUAL'),fila('4','SIN_VALIDACION_MANUAL')]});
    const p=(await new ControlOperativoRepositorio().listar(filtro)).datos[0]!;
    expect(p).toMatchObject({totalArticulos:4,controladosManualmente:2,confirmados:1,pendientes:1,sinValidacionManual:2});
    expect(p.lineas.map(l=>l.identificadorDetalle)).toEqual(['2']);
  });
  it('E: mismo código repetido no confunde identidades ni confirmaciones',async()=> {
    const a=fila('1');a.versionesConfirmadas=versionLineaFisica(a);
    mocks.query.mockResolvedValue({recordset:[a,fila('2')]});
    const r=await new ControlOperativoRepositorio().listar(filtro);
    expect(r.total).toBe(1);expect(r.datos[0]!.lineas[0]!.identificadorDetalle).toBe('2');
    expect(versionLineaFisica(fila('1'))).not.toBe(versionLineaFisica(fila('2')));
  });
  it('F: después de confirmar la última manual desaparece',async()=> {
    const a=fila('1');mocks.query.mockResolvedValue({recordset:[a]});
    const repo=new ControlOperativoRepositorio();expect((await repo.listar(filtro)).total).toBe(1);
    a.versionesConfirmadas=versionLineaFisica(a);
    expect((await repo.listar(filtro)).total).toBe(0);
  });
  it('G: leer la cola no modifica ni elimina Historial',async()=> {
    mocks.query.mockResolvedValue({recordset:[fila('1')]});
    await new ControlOperativoRepositorio().listar(filtro);
    expect(mocks.query).toHaveBeenCalledTimes(1);
    expect(mocks.query.mock.calls[0]![0]).not.toMatch(/\b(INSERT|UPDATE|DELETE|MERGE)\b/i);
  });
  it('solo acepta snapshot completo, líneas activas y Facturado conservado localmente',async()=> {
    await new ControlOperativoRepositorio().listar(filtro);
    const consulta=mocks.query.mock.calls[0]![0];
    expect(consulta).toContain('s.huellaActual IS NOT NULL');expect(consulta).toContain('l.activo=1');
    expect(consulta).toContain("p.estadoFinanciero=N'Facturado'");
    expect(consulta).toContain('NOT EXISTS(SELECT 1 FROM dbo.DevolucionPedido');
    expect(consulta).toContain('devolucion.idOrigen=p.idOrigen');
    expect(consulta).toContain('detalle.identificadorDetalle=l.identificadorDetalle');
    expect(consulta).toContain('detalle.codigoArticulo=l.codigoArticulo');
    expect(consulta).toContain('detalle.codigoAlmacen=l.codigoAlmacen');
  });
  it('no inventa MANUAL para bodegas sin clasificación',async()=> {
    mocks.query.mockResolvedValue({recordset:[fila('1',null)]});
    expect((await new ControlOperativoRepositorio().listar(filtro)).total).toBe(0);
  });
  it('identidades sintéticas no generan obligaciones confirmables',async()=> {
    mocks.query.mockResolvedValue({recordset:[fila('SIN-PARTIDA-1')]});
    expect((await new ControlOperativoRepositorio().listar(filtro)).total).toBe(0);
  });
  it('cambio de artículo, bodega o cantidad invalida la confirmación anterior',async()=> {
    const antes=fila('1');const actual={...antes,cantidad:2,versionesConfirmadas:versionLineaFisica(antes)};
    mocks.query.mockResolvedValue({recordset:[actual]});
    expect((await new ControlOperativoRepositorio().listar(filtro)).total).toBe(1);
    expect(versionLineaFisica(antes)).not.toBe(versionLineaFisica({...antes,codigoArticulo:'OTRO'}));
    expect(versionLineaFisica(antes)).not.toBe(versionLineaFisica({...antes,codigoAlmacen:'OTRA'}));
  });
  it('despacho parcial conserva únicamente la cantidad física restante',async()=> {
    mocks.query.mockResolvedValue({recordset:[{...fila('1'),cantidad:3,cantidadDespachada:1}]});
    expect((await new ControlOperativoRepositorio().listar(filtro)).datos[0]!.lineas[0]!.cantidad).toBe(2);
  });
  it('manual sin responsable se conserva sin autoasignar',async()=> {
    mocks.query.mockResolvedValue({recordset:[{...fila('1'),responsableConfigurado:null}]});
    const l=(await new ControlOperativoRepositorio().listar(filtro)).datos[0]!.lineas[0]!;
    expect(l.responsable).toBeNull();expect(l.usuarioAsignado).toBeNull();
  });
  it('responsable de asignación existente tiene preferencia sobre candidato de bodega',async()=> {
    mocks.query.mockResolvedValue({recordset:[{...fila('1'),nombreAsignado:'Asignado',usuarioAsignado:'tecnico'}]});
    expect((await new ControlOperativoRepositorio().listar(filtro)).datos[0]!.lineas[0]!.responsable).toBe('Asignado');
  });
  it('paginación por artículo cuenta líneas y por pedido cuenta cabeceras',async()=> {
    mocks.query.mockResolvedValue({recordset:[fila('1'),fila('2'),fila('3')]});
    const repo=new ControlOperativoRepositorio();
    expect(await repo.listar({...filtro,pagina:2,cantidadPorPagina:2})).toMatchObject({total:3,datos:[{lineas:[{identificadorDetalle:'3'}]}]});
    expect((await repo.listar({...filtro,vista:'pedido'})).total).toBe(1);
  });
});
describe('confirmación física local, permisos y concurrencia',()=> {
  it('confirma usando transacción y solo ConfirmacionFisicaPedido',async()=> {
    const f=fila('1');mocks.query.mockResolvedValueOnce({recordset:[f]}).mockResolvedValue({recordset:[]});
    await new ControlOperativoRepositorio().confirmar([{idOrigen:id,identificadorDetalle:'1',version:versionLineaFisica(f)}],usuario);
    expect(mocks.begin).toHaveBeenCalledOnce();expect(mocks.commit).toHaveBeenCalledOnce();expect(mocks.rollback).not.toHaveBeenCalled();
    const escritura=mocks.query.mock.calls[1]![0];expect(escritura).toContain('INSERT dbo.ConfirmacionFisicaPedido');
    expect(escritura).toContain("DB_NAME()<>N'PedidosBodega'");expect(escritura).not.toContain('UPDATE dbo.Pedido');
  });
  it('otra versión devuelve 409 y revierte sin registrar confirmación',async()=> {
    mocks.query.mockResolvedValue({recordset:[fila('1')]});
    await expect(new ControlOperativoRepositorio().confirmar([{idOrigen:id,identificadorDetalle:'1',version:'0'.repeat(64)}],usuario))
      .rejects.toMatchObject({estadoHttp:409});
    expect(mocks.rollback).toHaveBeenCalledOnce();expect(mocks.query).toHaveBeenCalledOnce();
  });
  it('asignación ajena devuelve 403',async()=> {
    const f={...fila('1'),usuarioAsignado:'otro'};mocks.query.mockResolvedValue({recordset:[f]});
    await expect(new ControlOperativoRepositorio().confirmar([{idOrigen:id,identificadorDetalle:'1',version:versionLineaFisica(f)}],usuario))
      .rejects.toMatchObject({estadoHttp:403});
    expect(mocks.rollback).toHaveBeenCalledOnce();
  });
  it('bodega no visible devuelve 403',async()=> {
    const f=fila('1');mocks.query.mockResolvedValue({recordset:[f]});
    await expect(new ControlOperativoRepositorio().confirmar([{idOrigen:id,identificadorDetalle:'1',version:versionLineaFisica(f)}],
      {...usuario,codigosAlmacenVisibles:['OTRA']})).rejects.toMatchObject({estadoHttp:403});
  });
  it('consulta no puede confirmar ni abrir transacción',async()=> {
    await expect(new ControlOperativoRepositorio().confirmar([],{...usuario,codigoRol:'CONSULTA'})).rejects.toMatchObject({estadoHttp:403});
    expect(mocks.begin).not.toHaveBeenCalled();
  });
  it('H: migración local protegida, materializa la política B manual/T automática sin modificar fuentes externas',()=> {
    expect(MIGRACION_CONTROL_OPERATIVO).toContain("DB_NAME() <> N'PedidosBodega'");
    expect(MIGRACION_CONTROL_OPERATIVO).toMatch(/INSERT\s+dbo\.ConfiguracionControlAlmacen/i);
    expect(MIGRACION_CONTROL_OPERATIVO).toContain("THEN 'MANUAL' ELSE 'SIN_VALIDACION_MANUAL'");
    expect(MIGRACION_CONTROL_OPERATIVO).toContain("IN ('B','T')");
    expect(MIGRACION_CONTROL_OPERATIVO).toContain('NOT EXISTS');
    expect(MIGRACION_CONTROL_OPERATIVO).not.toMatch(/\b(ORDR|RDR1|OINV|INV1|SO1_01VENTA)\b/);
  });
});
