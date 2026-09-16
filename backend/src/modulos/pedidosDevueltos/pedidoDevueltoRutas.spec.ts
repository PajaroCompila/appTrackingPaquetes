import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { crearPedidoDevueltoRutas, esquemaFiltrosDevolucion, type RepositorioDevolucionRutas } from './pedidoDevueltoRutas.js';
import { crearDevolucionDesdeDespacho } from './pedidoDevueltoServicio.js';
import type { IdentidadAutenticada } from '../autenticacion/autenticacion.interface.js';

const id='a'.repeat(64);
const pedido={...crearDevolucionDesdeDespacho({idOrigen:'R1:TSPS01:PE1',numeroPedido:'1001',fueDespachado:true,
  lineas:[{identificadorDetalle:'1',codigoArticulo:'A',descripcion:'Original',cantidad:1,codigoAlmacen:'BSPS03'},
  {identificadorDetalle:'2',codigoArticulo:'B',descripcion:'Original B',cantidad:2,codigoAlmacen:'BSPS02'}]})!,idClave:id};
let usuario:IdentidadAutenticada;
let repo:RepositorioDevolucionRutas;
function app(){const a=express();a.use(express.json());a.use((r,_s,n)=>{r.user=usuario;n();});
  a.use('/api/pedidos-devueltos',crearPedidoDevueltoRutas(repo));
  a.use((e:{estadoHttp?:number},_r:express.Request,s:express.Response,_n:express.NextFunction)=>s.status(e.estadoHttp??400).json({error:true}));return a;}
beforeEach(()=>{
  usuario={usuarioId:'1',nombreUsuario:'ana',nombreVisible:'Ana',codigoRol:'OPERADOR_BODEGA',codigoAlmacen:null,
    codigosAlmacenVisibles:['BSPS03'],sesionId:'1',debeCambiarContrasena:false};
  repo={listar:vi.fn().mockResolvedValue({datos:[pedido],total:1}),obtener:vi.fn().mockResolvedValue(pedido),confirmar:vi.fn().mockResolvedValue(undefined)};
});
describe('rutas de devolución',()=>{
  it('aplica almacenes autorizados antes de consultar y no expone otras líneas',async()=>{
    const r=await request(app()).get('/api/pedidos-devueltos?pagina=2&vista=articulos&estado=parcial');
    expect(r.status).toBe(200);expect(repo.listar).toHaveBeenCalledWith(expect.objectContaining({pagina:2,vista:'articulos',estado:'parcial',codigosAlmacen:['BSPS03']}));
    expect(r.body.datos[0].lineas).toHaveLength(1);expect(r.body.datos[0].lineas[0].codigoAlmacen).toBe('BSPS03');
  });
  it('rechaza rango inválido y páginas inválidas',()=>{
    expect(esquemaFiltrosDevolucion.safeParse({fechaDesde:'2026-02-30'}).success).toBe(false);
    expect(esquemaFiltrosDevolucion.safeParse({pagina:0}).success).toBe(false);
    expect(esquemaFiltrosDevolucion.safeParse({fechaDesde:'2026-09-17',fechaHasta:'2026-09-16'}).success).toBe(false);
  });
  it('no confirma en rol CONSULTA',async()=>{
    usuario.codigoRol='CONSULTA';const r=await request(app()).post('/api/pedidos-devueltos/confirmar').send({lineas:[{idClave:id,identificadorDetalle:'1'}]});
    expect(r.status).toBe(403);expect(repo.confirmar).not.toHaveBeenCalled();
  });
  it('confirma varias líneas usando la sesión, sin aceptar receptor o bodega desde cliente',async()=>{
    usuario.codigoRol='ADMINISTRADOR';const lineas=[{idClave:id,identificadorDetalle:'1'},{idClave:id,identificadorDetalle:'2'}];
    expect((await request(app()).post('/api/pedidos-devueltos/confirmar').send({lineas})).status).toBe(200);
    expect(repo.confirmar).toHaveBeenCalledWith(lineas,usuario);
    expect((await request(app()).post('/api/pedidos-devueltos/confirmar').send({lineas,recibidoPor:'Otro'})).status).toBe(400);
  });
  it('detalle filtra almacenes y rechaza acceso sin líneas visibles',async()=>{
    const r=await request(app()).get('/api/pedidos-devueltos/'+id);expect(r.body.datos.lineas).toHaveLength(1);
    usuario.codigosAlmacenVisibles=['TCIR01'];expect((await request(app()).get('/api/pedidos-devueltos/'+id)).status).toBe(403);
  });
  it('no presenta pedidos ficticios si el repositorio está vacío',async()=>{
    vi.mocked(repo.listar).mockResolvedValue({datos:[],total:0});const r=await request(app()).get('/api/pedidos-devueltos');
    expect(r.body.datos).toEqual([]);expect(r.body.paginacion.totalRegistros).toBe(0);
  });
});
