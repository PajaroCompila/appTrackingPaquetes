import { z } from 'zod';

const codigosAlmacen = z.preprocess((valor) => {
  const valores = valor === undefined ? [] : Array.isArray(valor) ? valor : [valor];
  return [...new Set(valores.map((codigo) => typeof codigo === 'string' ? codigo.trim() : codigo)
    .filter((codigo) => codigo !== ''))];
}, z.array(z.string().min(1).max(16).regex(/^[A-Za-z0-9_-]+$/)).max(50));

export const esquemaFiltrosHistorial = z
  .object({
    fechaDesde: z.iso.date(),
    fechaHasta: z.iso.date(),
    numeroPedido: z.string().trim().min(1).max(20).regex(/^\d+$/).optional(),
    codigoAlmacen: codigosAlmacen,
    pagina: z.coerce.number().int().min(1).default(1),
    cantidadPorPagina: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict()
  .refine(({ fechaDesde, fechaHasta }) => fechaDesde <= fechaHasta, {
    message: 'La fecha inicial no puede ser posterior a la final.',
  })
  .refine(({ fechaDesde, fechaHasta }) => {
    const desde = new Date(`${fechaDesde}T00:00:00Z`);
    const hasta = new Date(`${fechaHasta}T00:00:00Z`);
    return (hasta.getTime() - desde.getTime()) / 86400000 <= 366;
  }, { message: 'El rango máximo permitido es de 366 días.' })
  .transform(({ codigoAlmacen, ...filtros }) => ({ ...filtros, codigosAlmacen: codigoAlmacen }));
