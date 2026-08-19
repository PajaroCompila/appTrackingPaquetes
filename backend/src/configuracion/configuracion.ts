import 'dotenv/config';
import { z } from 'zod';

const esquemaConfiguracion = z.object({
  ENTORNO: z.enum(['desarrollo', 'prueba', 'produccion']).default('desarrollo'),
  PUERTO: z.coerce.number().int().min(1).max(65535).default(3280),
  ORIGEN_CORS: z.url().default('http://localhost:4400'),
});

const resultadoConfiguracion = esquemaConfiguracion.safeParse(process.env);

if (!resultadoConfiguracion.success) {
  throw new Error('La configuración de la aplicación no es válida.');
}

export const configuracion = {
  entorno: resultadoConfiguracion.data.ENTORNO,
  puerto: resultadoConfiguracion.data.PUERTO,
  origenCors: resultadoConfiguracion.data.ORIGEN_CORS,
} as const;

export function obtenerConfiguracionAutenticacion(variablesEntorno = process.env) {
  const resultado = z.object({
    AUTENTICACION_JWT_SECRETO: z.string().min(32),
    AUTENTICACION_DURACION_MINUTOS: z.coerce.number().int().min(15).max(1440).default(480),
  }).safeParse(variablesEntorno);
  if (!resultado.success) {
    throw new Error('La configuraciÃ³n de autenticaciÃ³n no es vÃ¡lida o estÃ¡ incompleta.');
  }
  return {
    secretoJwt: resultado.data.AUTENTICACION_JWT_SECRETO,
    duracionMinutos: resultado.data.AUTENTICACION_DURACION_MINUTOS,
    cookieSegura: configuracion.entorno === 'produccion',
  } as const;
}
