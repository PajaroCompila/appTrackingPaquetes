import { z } from 'zod';

const textoOpcional = (longitudMaxima: number) =>
  z.string().trim().min(1).max(longitudMaxima).optional();

const enteroConsulta = (valorPredeterminado: number, maximo?: number) =>
  z.coerce.number().int().min(1).max(maximo ?? Number.MAX_SAFE_INTEGER).default(valorPredeterminado);

const codigosAlmacen = z.preprocess((valor) => {
  const valores = valor === undefined ? [] : Array.isArray(valor) ? valor : [valor];
  const normalizados = valores
    .map((codigo) => typeof codigo === 'string' ? codigo.trim() : codigo)
    .filter((codigo) => codigo !== '');
  return [...new Set(normalizados)];
}, z.array(
  z.string().min(1).max(16).regex(/^[A-Za-z0-9_-]+$/),
).max(50));

export const esquemaFiltrosPedidos = z
  .object({
    numeroPedido: textoOpcional(20),
    fechaDesde: z.iso.date().optional(),
    fechaHasta: z.iso.date().optional(),
    codigoAlmacen: codigosAlmacen,
    codigoEstadoVenta: textoOpcional(1),
    codigoSincronizacion: textoOpcional(1),
    pagina: enteroConsulta(1),
    cantidadPorPagina: enteroConsulta(25, 100),
  })
  .strict()
  .refine(
    ({ fechaDesde, fechaHasta }) => !fechaDesde || !fechaHasta || fechaDesde <= fechaHasta,
    { message: 'La fecha inicial no puede ser posterior a la fecha final.' },
  )
  .transform(({ codigoAlmacen, ...filtros }) => ({
    ...filtros,
    codigosAlmacen: codigoAlmacen,
  }));

export const esquemaFolioPedido = z.string().trim().min(1).max(150);

export const esquemaFiltroDetallePedido = z.object({
  codigoAlmacen: codigosAlmacen,
}).strict().transform(({ codigoAlmacen }) => ({ codigosAlmacen: codigoAlmacen }));
