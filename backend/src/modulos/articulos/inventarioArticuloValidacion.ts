import { z } from 'zod';

const codigoSeguro = (maximo: number) =>
  z.string().trim().min(1).max(maximo).regex(/^[A-Za-z0-9_.\-/]+$/);

export const esquemaCodigoArticulo = codigoSeguro(100);
export const esquemaConsultaInventario = z.object({
  codigoAlmacen: codigoSeguro(16),
}).strict();

