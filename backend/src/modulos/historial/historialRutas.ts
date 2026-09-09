import { Router } from 'express';
import { ErrorAplicacion } from '../../compartido/errores/errorAplicacion.js';
import { HistorialServicio } from './historialServicio.js';
import { esquemaFiltrosHistorial } from './historialValidacion.js';
import { z } from 'zod';
import { puedeVerAlmacen, restringirCodigosAlmacen } from '../usuarios/accesoAlmacenes.js';

export const historialRutas = Router();
const servicio = new HistorialServicio();
const idOrigen = z.string().regex(/^(R1|SAP):.{1,140}$/);

historialRutas.get('/', async (solicitud, respuesta, siguiente) => {
  const validacion = esquemaFiltrosHistorial.safeParse(solicitud.query);
  if (!validacion.success) {
    siguiente(new ErrorAplicacion(400, 'FILTROS_HISTORIAL_INVALIDOS', 'Los filtros del historial no son válidos.'));
    return;
  }
  try {
    const filtros = { ...validacion.data, codigosAlmacen: restringirCodigosAlmacen(
      solicitud.user!, validacion.data.codigosAlmacen) };
    const pagina = await servicio.buscar(filtros);
    respuesta.json({
      datos: pagina.registros,
      paginacion: {
        pagina: pagina.pagina,
        cantidadPorPagina: pagina.cantidadPorPagina,
        cantidadDevuelta: pagina.registros.length,
        hayMas: pagina.hayMas,
      },
    });
  } catch (error) {
    siguiente(error);
  }
});

historialRutas.get('/articulos', async (solicitud, respuesta, siguiente) => {
  const validacion = esquemaFiltrosHistorial.safeParse(solicitud.query);
  if (!validacion.success) {
    siguiente(new ErrorAplicacion(400, 'FILTROS_HISTORIAL_INVALIDOS', 'Los filtros del historial no son válidos.'));
    return;
  }
  try {
    const filtros = { ...validacion.data, codigosAlmacen: restringirCodigosAlmacen(
      solicitud.user!, validacion.data.codigosAlmacen) };
    const pagina = await servicio.buscarArticulos(filtros);
    respuesta.json({ datos: pagina.registros, paginacion: {
      pagina: pagina.pagina, cantidadPorPagina: pagina.cantidadPorPagina,
      cantidadDevuelta: pagina.registros.length, hayMas: pagina.hayMas,
    } });
  } catch (error) { siguiente(error); }
});

historialRutas.get('/:idOrigen', async (solicitud, respuesta, siguiente) => {
  try {
    const pedido = await servicio.obtener(idOrigen.parse(solicitud.params.idOrigen));
    if (pedido) pedido.articulos = pedido.articulos.filter(({ codigoAlmacen }) =>
      puedeVerAlmacen(solicitud.user!, codigoAlmacen));
    if (!pedido || pedido.articulos.length === 0) throw new ErrorAplicacion(404, 'HISTORIAL_NO_ENCONTRADO',
      'El pedido validado no existe en el historial local.');
    respuesta.json({ datos: pedido });
  } catch (error) {
    siguiente(error);
  }
});
