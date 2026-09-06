import { z } from "zod";

const texto = (campo: string, maximo: number) => z.string().trim().min(1, `${campo} es obligatorio`).max(maximo);

export const datosEnvioEsquema = z.object({
  puntoOrigenId: z.number().int().positive(),
  puntoDestinoId: z.number().int().positive(),
  nombreRemitente: texto("El remitente", 120),
  telefonoRemitente: texto("El teléfono del remitente", 30),
  nombreDestinatario: texto("El destinatario", 120),
  telefonoDestinatario: texto("El teléfono del destinatario", 30),
  descripcion: texto("La descripción", 250),
  cantidadPaquetes: z.number().int().positive().max(1000),
});

export const actualizacionEnvioEsquema = datosEnvioEsquema.extend({
  estadoActual: z.enum(["registrado", "en_transito", "recibido", "cancelado"]),
});
export const recepcionEnvioEsquema = z.object({ envioId: z.number().int().positive(), usuarioRecibeId: z.number().int().positive() });
export const recepcionLoteEsquema = z.object({ envioIds: z.array(z.number().int().positive()).min(1).max(100), usuarioRecibeId: z.number().int().positive() });
