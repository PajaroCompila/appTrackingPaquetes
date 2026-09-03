import { z } from 'zod';

export const esquemaFiltrosDashboard = z.object({
  fechaDesde: z.iso.date(),
  fechaHasta: z.iso.date(),
  codigoTienda: z.string().trim().min(1).max(16).regex(/^[\p{L}\p{N}._-]+$/u).optional(),
}).strict()
  .refine(({ fechaDesde, fechaHasta }) => fechaDesde <= fechaHasta, {
    message: 'La fecha inicial no puede ser posterior a la fecha final.',
  })
  .refine(({ fechaDesde, fechaHasta }) => {
    const desde = new Date(`${fechaDesde}T00:00:00Z`);
    const hasta = new Date(`${fechaHasta}T00:00:00Z`);
    return (hasta.getTime() - desde.getTime()) / 86_400_000 <= 31;
  }, { message: 'El rango máximo permitido es de 31 días.' });

export const esquemaVentasVendedor = z.object({
  codigoSucursal: z.string().trim().min(1).max(16).regex(/^[\p{L}\p{N}._-]+$/u),
  fechaDesde: z.iso.date(),
  fechaHasta: z.iso.date(),
}).strict().refine(({ fechaDesde, fechaHasta }) => fechaDesde <= fechaHasta, {
  message: 'La fecha inicial no puede ser posterior a la fecha final.',
}).refine(({ fechaDesde, fechaHasta }) => {
  const desde = new Date(`${fechaDesde}T00:00:00Z`);
  const hasta = new Date(`${fechaHasta}T00:00:00Z`);
  return (hasta.getTime() - desde.getTime()) / 86_400_000 <= 31;
}, { message: 'El rango máximo permitido es de 31 días.' });

export const esquemaDetalleVentasVendedor = z.object({
  codigoSucursal: z.string().trim().min(1).max(16).regex(/^[\p{L}\p{N}._-]+$/u),
  codigoVendedor: z.string().trim().min(1).max(20).regex(/^-?\d+$/).optional(),
  fechaDesde: z.iso.date(),
  fechaHasta: z.iso.date(),
  pagina: z.coerce.number().int().min(1).default(1),
  cantidadPorPagina: z.coerce.number().int().min(1).max(100).default(25),
}).strict().refine(({ fechaDesde, fechaHasta }) => fechaDesde <= fechaHasta, {
  message: 'La fecha inicial no puede ser posterior a la fecha final.',
}).refine(({ fechaDesde, fechaHasta }) => {
  const desde = new Date(`${fechaDesde}T00:00:00Z`);
  const hasta = new Date(`${fechaHasta}T00:00:00Z`);
  return (hasta.getTime() - desde.getTime()) / 86_400_000 <= 31;
}, { message: 'El rango máximo permitido es de 31 días.' });
