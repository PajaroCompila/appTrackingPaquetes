import { Router } from 'express';
import { z } from 'zod';
import { ErrorAplicacion } from '../../compartido/errores/errorAplicacion.js';
import { requerirRoles } from '../autenticacion/autenticacionMiddleware.js';
import { puedeVerAlmacen, restringirCodigosAlmacen } from '../usuarios/accesoAlmacenes.js';
import { PedidoDevueltoRepositorio, type FiltrosDevolucion, type SeleccionDevolucion } from './pedidoDevueltoRepositorio.js';
import type { PedidoDevuelto } from './pedidoDevueltoServicio.js';
import type { IdentidadAutenticada } from '../autenticacion/autenticacion.interface.js';

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0,10)===v);
const errorDatos = (e: unknown): unknown => e instanceof z.ZodError
  ? new ErrorAplicacion(400,'DATOS_DEVOLUCION_INVALIDOS','Revisá los filtros o las partidas seleccionadas.') : e;
export const esquemaFiltrosDevolucion = z.object({
  numeroPedido: z.string().trim().max(100).optional(), fechaDesde: fecha.optional(), fechaHasta: fecha.optional(),
  codigoAlmacen: z.preprocess(v => v === undefined ? [] : Array.isArray(v) ? v : [v],z.array(z.string().trim().regex(/^[A-Za-z0-9_-]{1,16}$/)).max(100)),
  estado: z.enum(['todos','pendiente','parcial','devuelto']).default('todos'),
  pagina: z.coerce.number().int().positive().max(100000).default(1),
  cantidadPorPagina: z.coerce.number().pipe(z.union([z.literal(25),z.literal(50),z.literal(100)])).default(25),
  vista: z.enum(['pedido','articulos']).default('pedido'),
}).refine(f => !f.fechaDesde || !f.fechaHasta || f.fechaDesde<=f.fechaHasta,{message:'Revisá el rango de fechas.'});
export const esquemaConfirmarDevolucion = z.object({ lineas: z.array(z.object({
  idClave: z.string().regex(/^[a-f0-9]{64}$/), identificadorDetalle: z.string().trim().min(1).max(150),
}).strict()).min(1).max(100) }).strict();
export interface RepositorioDevolucionRutas {
  listar(f: FiltrosDevolucion): Promise<{datos: PedidoDevuelto[];total:number}>;
  obtener(id: string): Promise<PedidoDevuelto|null>;
  confirmar(s: SeleccionDevolucion[],u: IdentidadAutenticada): Promise<void>;
}
export function crearPedidoDevueltoRutas(repo: RepositorioDevolucionRutas = new PedidoDevueltoRepositorio()): Router {
  const rutas = Router();
  rutas.get('/',async(req,res,next) => {
    try {
      if (!req.user) throw new ErrorAplicacion(401,'SESION_REQUERIDA','Debés iniciar sesión.');
      const {codigoAlmacen,...f} = esquemaFiltrosDevolucion.parse(req.query);
      const codigosAlmacen = restringirCodigosAlmacen(req.user,codigoAlmacen).map(c => c.toUpperCase());
      const r = await repo.listar({...f,codigosAlmacen});
      const datos = r.datos.map(p => ({...p,lineas:p.lineas.filter(l => puedeVerAlmacen(req.user,l.codigoAlmacen)
        && (!codigosAlmacen.length || codigosAlmacen.includes(l.codigoAlmacen?.toUpperCase() ?? '')))})).filter(p => p.lineas.length>0);
      res.json({datos,paginacion:{pagina:f.pagina,cantidadPorPagina:f.cantidadPorPagina,totalRegistros:r.total,
        cantidadDevuelta:f.vista==='pedido'?datos.length:datos.reduce((n,p)=>n+p.lineas.length,0),hayMas:f.pagina*f.cantidadPorPagina<r.total}});
    } catch(e) {next(errorDatos(e));}
  });
  rutas.post('/confirmar',requerirRoles('ADMINISTRADOR','OPERADOR_BODEGA'),async(req,res,next) => {
    try {
      const {lineas} = esquemaConfirmarDevolucion.parse(req.body);
      await repo.confirmar(lineas,req.user!);
      res.json({exito:true});
    } catch(e) {next(errorDatos(e));}
  });
  rutas.get('/:idClave',async(req,res,next) => {
    try {
      if (!req.user) throw new ErrorAplicacion(401,'SESION_REQUERIDA','Debés iniciar sesión.');
      const id = z.string().regex(/^[a-f0-9]{64}$/).parse(req.params.idClave);
      const pedido = await repo.obtener(id);
      if (!pedido) throw new ErrorAplicacion(404,'DEVOLUCION_NO_ENCONTRADA','No se encontró la devolución.');
      const lineas = pedido.lineas.filter(l => puedeVerAlmacen(req.user,l.codigoAlmacen));
      if (!lineas.length) throw new ErrorAplicacion(403,'PERMISO_DEVOLUCION','No tenés permiso para ver esta devolución.');
      res.json({datos:{...pedido,lineas}});
    } catch(e) {next(errorDatos(e));}
  });
  return rutas;
}
export const pedidoDevueltoRutas = crearPedidoDevueltoRutas();
