import express, {type ErrorRequestHandler} from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { crearControlOperativoRutas } from './controlOperativoRutas.js';
import type { ControlOperativoRepositorio } from './controlOperativoRepositorio.js';
import type { IdentidadAutenticada } from '../autenticacion/autenticacion.interface.js';
const repo={disponible:vi.fn(),listar:vi.fn(),obtener:vi.fn(),configuraciones:vi.fn(),configurar:vi.fn(),confirmar:vi.fn()};
const usuario:IdentidadAutenticada={usuarioId:'u',nombreUsuario:'operador',nombreVisible:'Operador',codigoRol:'OPERADOR_BODEGA',
  codigoAlmacen:null,sesionId:'s',debeCambiarContrasena:false,codigosAlmacenVisibles:['BODEGA']};
function app(u:IdentidadAutenticada|undefined=usuario) {
  const a=express();a.use(express.json());a.use((req,_res,next)=>{req.user=u;next();});
  a.use('/cola',crearControlOperativoRutas(repo as unknown as ControlOperativoRepositorio));
  a.use(((e,_req,res,next)=>{void next;res.status(e.estadoHttp ?? 500).json({codigo:e.codigo});}) as ErrorRequestHandler);return a;
}
beforeEach(()=> {
  vi.clearAllMocks();repo.disponible.mockResolvedValue(true);repo.listar.mockResolvedValue({datos:[],total:0});
  repo.configuraciones.mockResolvedValue([{codigoAlmacen:'BODEGA',modoControl:null,activo:false},
    {codigoAlmacen:'OTRA',modoControl:null,activo:false}]);repo.obtener.mockResolvedValue(null);
});
describe('API facturados pendientes',()=> {
  it('aplica visibilidad al listar y no expone advertencias de bodegas ajenas',async()=> {
    const r=await request(app()).get('/cola');expect(r.status).toBe(200);
    expect(repo.listar).toHaveBeenCalledWith(expect.objectContaining({codigosAlmacen:['BODEGA']}));
    expect(r.body.almacenesSinConfiguracion).toEqual(['BODEGA']);
  });
  it('filtro ajeno no amplía permisos',async()=> {
    await request(app()).get('/cola?codigoAlmacen=OTRA');
    expect(repo.listar).toHaveBeenCalledWith(expect.objectContaining({codigosAlmacen:['SIN_ACCESO']}));
  });
  it.each(['pagina=0','cantidadPorPagina=101','vista=desconocida','fechaDesde=2026-09-19&fechaHasta=2026-09-18'])('datos inválidos %s devuelven 400',async(query)=> {
    expect((await request(app()).get(`/cola?${query}`)).status).toBe(400);expect(repo.listar).not.toHaveBeenCalled();
  });
  it('sin migración devuelve 503, sin consultar tablas nuevas',async()=> {
    repo.disponible.mockResolvedValue(false);expect((await request(app()).get('/cola')).status).toBe(503);
    expect(repo.listar).not.toHaveBeenCalled();
  });
  it('detalle usa identidad y visibilidad local, no busca R1 abierto',async()=> {
    repo.obtener.mockResolvedValue({idOrigen:'R1:TSPS01:PE1',lineas:[{identificadorDetalle:'1'}]});
    expect((await request(app()).get('/cola/R1%3ATSPS01%3APE1')).status).toBe(200);
    expect(repo.obtener).toHaveBeenCalledWith('R1:TSPS01:PE1',['BODEGA']);
  });
  it('solo administrador cambia modos, operador no escribe configuración',async()=> {
    expect((await request(app()).put('/cola/configuracion/BODEGA').send({modoControl:'MANUAL'})).status).toBe(403);
    expect(repo.configurar).not.toHaveBeenCalled();
  });
  it('administrador cambia modo sin cambiar código ni usuarios',async()=> {
    const r=await request(app({...usuario,codigoRol:'ADMINISTRADOR'})).put('/cola/configuracion/BODEGA')
      .send({modoControl:'SIN_VALIDACION_MANUAL'});
    expect(r.status).toBe(200);expect(repo.configurar).toHaveBeenCalledWith('BODEGA','SIN_VALIDACION_MANUAL',true);
  });
  it('no configura silenciosamente un almacén inexistente',async()=> {
    const r=await request(app({...usuario,codigoRol:'ADMINISTRADOR'})).put('/cola/configuracion/INVENTADO').send({modoControl:'MANUAL'});
    expect(r.status).toBe(400);expect(repo.configurar).not.toHaveBeenCalled();
  });
  it('selección duplicada se rechaza antes de escribir',async()=> {
    const linea={idOrigen:'SAP:1',identificadorDetalle:'0',version:'a'.repeat(64)};
    expect((await request(app()).post('/cola/confirmar').send({lineas:[linea,linea]})).status).toBe(400);
    expect(repo.confirmar).not.toHaveBeenCalled();
  });
  it('rol Consulta no puede confirmar',async()=> {
    expect((await request(app({...usuario,codigoRol:'CONSULTA'})).post('/cola/confirmar').send({lineas:[]})).status).toBe(403);
    expect(repo.confirmar).not.toHaveBeenCalled();
  });
});
