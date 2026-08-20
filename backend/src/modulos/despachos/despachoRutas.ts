import { Router } from 'express';
import { z } from 'zod';
import { ErrorAplicacion } from '../../compartido/errores/errorAplicacion.js';
import { DespachoRepositorio } from './despachoRepositorio.js';
import { DespachoServicio } from './despachoServicio.js';
import { LineaDespachoOrigenRepositorio } from './lineaDespachoOrigenRepositorio.js';
import { HistorialServicio } from '../historial/historialServicio.js';
import { requerirRoles } from '../autenticacion/autenticacionMiddleware.js';

export const despachoRutas = Router();
const repositorio = new DespachoRepositorio();
const servicio = new DespachoServicio(repositorio, new LineaDespachoOrigenRepositorio());
const historialServicio = new HistorialServicio();
const idOrigen = z.string().regex(/^(R1|SAP):.{1,140}$/);
const identidadDetalle = z.string().regex(/^\d{1,20}$/);
const codigosAlmacen = z.preprocess((valor) => {
  const valores = valor === undefined ? [] : Array.isArray(valor) ? valor : [valor];
  return [...new Set(valores.map((codigo) => typeof codigo === 'string' ? codigo.trim() : codigo)
    .filter((codigo) => codigo !== ''))];
}, z.array(z.string().min(1).max(16).regex(/^[A-Za-z0-9_-]+$/)).max(50));
export const esquemaFiltrosDespachados = z.object({
  numeroPedido: z.string().trim().min(1).max(20).regex(/^\d+$/).optional(),
  fechaDesde: z.iso.date().optional(),
  fechaHasta: z.iso.date().optional(),
  codigoAlmacen: codigosAlmacen,
  pagina: z.coerce.number().int().min(1).default(1),
  cantidadPorPagina: z.coerce.number().int().min(1).max(100).default(25),
}).strict().refine(({ fechaDesde, fechaHasta }) =>
  !fechaDesde || !fechaHasta || fechaDesde <= fechaHasta, {
  message: 'La fecha inicial no puede ser posterior a la fecha final.',
}).transform(({ codigoAlmacen, ...filtros }) => ({ ...filtros, codigosAlmacen: codigoAlmacen }));
const transferencia = z.object({
  lineas: z.array(z.object({
    idOrigen,
    identificadorDetalle: identidadDetalle,
  }).strict()).min(1).max(100),
}).strict();

despachoRutas.get('/', async (solicitud, respuesta, siguiente) => {
  try {
    await historialServicio.sincronizar();
    const filtros = esquemaFiltrosDespachados.parse(solicitud.query);
    const resultado = await repositorio.listar(filtros);
    respuesta.json({ datos: resultado.pedidos, paginacion: {
      pagina: filtros.pagina, cantidadPorPagina: filtros.cantidadPorPagina,
      totalRegistros: resultado.total,
      hayMas: filtros.pagina * filtros.cantidadPorPagina < resultado.total,
    } });
  } catch (error) { siguiente(error); }
});

despachoRutas.get('/:idOrigen', async (solicitud, respuesta, siguiente) => {
  try {
    const resultado = await repositorio.obtener(idOrigen.parse(solicitud.params.idOrigen));
    if (!resultado) throw new ErrorAplicacion(404, 'DESPACHO_NO_ENCONTRADO',
      'El pedido despachado no existe.');
    respuesta.json({ datos: resultado });
  } catch (error) { siguiente(error); }
});

despachoRutas.post('/', requerirRoles('ADMINISTRADOR', 'OPERADOR_BODEGA'), async (solicitud, respuesta, siguiente) => {
  try {
    const cuerpo = transferencia.parse(solicitud.body);
    const resultado = await servicio.transferir(cuerpo.lineas, solicitud.user!.usuarioId);
    respuesta.status(201).json({ datos: resultado });
  } catch (error) { siguiente(error); }
});
