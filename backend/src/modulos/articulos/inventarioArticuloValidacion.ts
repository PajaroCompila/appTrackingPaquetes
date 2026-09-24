import { z } from 'zod';

const codigoSeguro = (maximo: number, permiteEspacios = false) =>
  z.string().trim().min(1).max(maximo).regex(
    permiteEspacios ? /^[A-Za-z0-9_.\-/ ]+$/ : /^[A-Za-z0-9_.\-/]+$/,
  );

export const esquemaCodigoArticulo = codigoSeguro(100, true);
export const esquemaConsultaInventario = z.object({
  codigoAlmacen: codigoSeguro(16),
}).strict();

