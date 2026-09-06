import { z } from "zod";

const texto = (campo: string, maximo: number) => z.string().trim().min(1, `${campo} es obligatorio`).max(maximo);

export const datosSucursalEsquema = z.object({
  nombre: texto("El nombre", 100),
  codigo: texto("El código", 20).regex(/^[a-zA-Z0-9-]+$/, "El código contiene caracteres no permitidos"),
  direccion: texto("La dirección", 200),
  departamentoCodigo: z.string().trim().regex(/^\d{2}$/, "Selecciona un departamento válido"),
  ciudadCodigo: z.string().trim().regex(/^\d{4}$/, "Selecciona una ciudad válida"),
  telefono: texto("El teléfono", 30),
});
