import "dotenv/config";
import { z } from "zod";

const entornoEsquema = z.object({
  PUERTO_BACKEND: z.coerce.number().int().min(1).max(65535).default(3000),
  ORIGEN_FRONTEND: z.string().url().default("http://localhost:4200"),
  SQL_SERVIDOR: z.string().min(1),
  SQL_PUERTO: z.coerce.number().int().default(1433),
  SQL_BASE_DATOS: z.string().min(1).default("TrackingPaquetes"),
  SQL_USUARIO: z.string().min(1),
  SQL_CONTRASENA: z.string().min(1),
  SQL_CIFRAR: z.enum(["true", "false"]).default("false"),
  TOKEN_SECRETO: z
    .string()
    .min(32, "TOKEN_SECRETO debe tener al menos 32 caracteres"),
  TOKEN_DURACION: z.string().min(2).default("8h"),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
});

export type Configuracion = ReturnType<typeof cargarConfiguracion>;
export function cargarConfiguracion() {
  const valores = entornoEsquema.parse(process.env);
  return {
    puerto: valores.PUERTO_BACKEND,
    origenFrontend: valores.ORIGEN_FRONTEND,
    sql: {
      server: valores.SQL_SERVIDOR,
      port: valores.SQL_PUERTO,
      database: valores.SQL_BASE_DATOS,
      user: valores.SQL_USUARIO,
      password: valores.SQL_CONTRASENA,
      options: {
        encrypt: valores.SQL_CIFRAR === "true",
        trustServerCertificate: valores.NODE_ENV !== "production",
      },
      pool: { min: 0, max: 10, idleTimeoutMillis: 30000 },
    },
    tokenSecreto: valores.TOKEN_SECRETO,
    tokenDuracion: valores.TOKEN_DURACION,
    produccion: valores.NODE_ENV === "production",
  };
}

const adminEsquema = z.object({
  ADMIN_INICIAL_NOMBRES: z.string().trim().min(1).max(80),
  ADMIN_INICIAL_APELLIDOS: z.string().trim().min(1).max(80),
  ADMIN_INICIAL_USUARIO: z.string().trim().min(1).max(40),
  ADMIN_INICIAL_CORREO: z.string().trim().email().max(160),
  ADMIN_INICIAL_CONTRASENA: z.string().min(12).max(200),
});
export function cargarAdministradorInicial() {
  const valores = adminEsquema.parse(process.env);
  return {
    nombres: valores.ADMIN_INICIAL_NOMBRES,
    apellidos: valores.ADMIN_INICIAL_APELLIDOS,
    nombreUsuario: valores.ADMIN_INICIAL_USUARIO,
    correoElectronico: valores.ADMIN_INICIAL_CORREO,
    contrasena: valores.ADMIN_INICIAL_CONTRASENA,
  };
}
