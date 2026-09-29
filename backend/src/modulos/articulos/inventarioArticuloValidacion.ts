import { z } from 'zod';

const codigoSeguro = (maximo: number, permiteEspacios = false) =>
  z.string().trim().min(1).max(maximo).regex(
    permiteEspacios ? /^[A-Za-z0-9_.\-/ ]+$/ : /^[A-Za-z0-9_.\-/]+$/,
  );

export const esquemaCodigoArticulo = codigoSeguro(100, true);
export const esquemaConsultaInventario = z.object({
  codigoAlmacen: codigoSeguro(16).optional(),
}).strict();

export const esquemaBusquedaInventario = z.object({
  termino: z.string().trim().min(2).max(100),
  limite: z.coerce.number().int().min(1).max(50).default(20),
}).strict();

