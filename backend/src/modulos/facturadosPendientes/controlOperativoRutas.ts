import { Router } from 'express';
import { z } from 'zod';
import { ErrorAplicacion } from '../../compartido/errores/errorAplicacion.js';
import { requerirRoles } from '../autenticacion/autenticacionMiddleware.js';
import { restringirCodigosAlmacen, puedeVerAlmacen } from '../usuarios/accesoAlmacenes.js';
import { ControlOperativoRepositorio } from './controlOperativoRepositorio.js';

export const esquemaFiltrosControl = z.object({
  numeroPedido:z.string().trim().max(100).optional(),fechaDesde:z.iso.date().optional(),fechaHasta:z.iso.date().optional(),
  codigoAlmacen:z.preprocess(v=>v===undefined ? [] : Array.isArray(v) ? v : [v],
    z.array(z.string().trim().regex(/^[A-Za-z0-9_-]{1,16}$/)).max(50)),
  pagina:z.coerce.number().int().min(1).max(100000).default(1),
  cantidadPorPagina:z.coerce.number().int().min(1).max(100).default(25),
  vista:z.enum(['pedido','articulos']).default('articulos'),
}).strict().refine(f=>!f.fechaDesde || !f.fechaHasta || f.fechaDesde<=f.fechaHasta);
const identidad=z.string().regex(/^(R1|SAP):.{1,140}$/);
export const esquemaConfirmacionFisica=z.object({lineas:z.array(z.object({
  idOrigen:identidad,identificadorDetalle:z.string().regex(/^\d{1,20}$/),version:z.string().regex(/^[a-f0-9]{64}$/),
}).strict()).min(1).max(100)}).strict().refine(({lineas})=>
  new Set(lineas.map(l=>JSON.stringify([l.idOrigen,l.identificadorDetalle]))).size===lineas.length);
const esquemaConfig=z.object({modoControl:z.enum(['MANUAL','SIN_VALIDACION_MANUAL']),activo:z.boolean().default(true)}).strict();
export function crearControlOperativoRutas(repo=new ControlOperativoRepositorio()): Router {
  const rutas=Router();
  rutas.use(async(req,_res,next)=> {
    try {
      if (!req.user) throw new ErrorAplicacion(401,'SESION_REQUERIDA','Debés iniciar sesión.');
      if (!await repo.disponible()) throw new ErrorAplicacion(503,'CONTROL_NO_CONFIGURADO',
        'El control de facturados pendientes todavía no está habilitado.');
      next();
    } catch(e) {next(e);}
  });
  rutas.get('/configuracion',requerirRoles('ADMINISTRADOR'),async(_req,res,next)=> {
    try {res.json({datos:await repo.configuraciones()});} catch(e) {next(e);}
  });
  rutas.put('/configuracion/:codigo',requerirRoles('ADMINISTRADOR'),async(req,res,next)=> {
    try {
      const codigo=z.string().regex(/^[A-Za-z0-9_-]{1,16}$/).parse(req.params.codigo).toUpperCase();
      const d=esquemaConfig.parse(req.body);
      if (!(await repo.configuraciones()).some(c=>c.codigoAlmacen.toUpperCase()===codigo)) {
        throw new ErrorAplicacion(400,'ALMACEN_DESCONOCIDO','La bodega no está registrada en los snapshots locales.');
      }
      await repo.configurar(codigo,d.modoControl,d.activo);
      res.json({exito:true});
    } catch(e) {next(e);}
  });
  rutas.post('/confirmar',requerirRoles('ADMINISTRADOR','OPERADOR_BODEGA'),async(req,res,next)=> {
    try {
      await repo.confirmar(esquemaConfirmacionFisica.parse(req.body).lineas,req.user!);
      res.json({exito:true});
    } catch(e) {next(e);}
  });
  rutas.get('/',async(req,res,next)=> {
    try {
      const {codigoAlmacen,...f}=esquemaFiltrosControl.parse(req.query);
      const codigosAlmacen=restringirCodigosAlmacen(req.user!,codigoAlmacen).map(c=>c.toUpperCase());
      const [r,config]=await Promise.all([repo.listar({...f,codigosAlmacen}),repo.configuraciones()]);
      res.json({datos:r.datos,paginacion:{pagina:f.pagina,cantidadPorPagina:f.cantidadPorPagina,
        totalRegistros:r.total,hayMas:f.pagina*f.cantidadPorPagina<r.total},
        almacenesSinConfiguracion:config.filter(c=>(!c.activo || !c.modoControl)
          && puedeVerAlmacen(req.user,c.codigoAlmacen)
          && (!codigosAlmacen.length || codigosAlmacen.includes(c.codigoAlmacen))).map(c=>c.codigoAlmacen)});
    } catch(e) {next(e);}
  });
  rutas.get('/:idOrigen',async(req,res,next)=> {
    try {
      const pedido=await repo.obtener(identidad.parse(req.params.idOrigen),restringirCodigosAlmacen(req.user!,[]));
      if (!pedido) throw new ErrorAplicacion(404,'FACTURADO_PENDIENTE_NO_ENCONTRADO','El pedido no tiene partidas pendientes de entrega.');
      res.json({datos:pedido});
    } catch(e) {next(e);}
  });
  // Zod no se convierte en un error 500 para filtros o selecciones inválidas.
  rutas.use((error:unknown,_req:unknown,_res:unknown,next:(e:unknown)=>void)=> {
    next(error instanceof z.ZodError ? new ErrorAplicacion(400,'DATOS_CONTROL_INVALIDOS',
      'Revisá los filtros o las partidas seleccionadas.') : error);
  });
  return rutas;
}
export const controlOperativoRutas=crearControlOperativoRutas();
