import { z } from 'zod';

export const esquemaInicioSesion = z.object({
  nombreUsuario: z.string().trim().min(1).max(100),
  contrasena: z.string().min(1).max(256),
}).strict();

export const esquemaCambioContrasena = z.object({
  contrasenaActual: z.string().min(1).max(128),
  nuevaContrasena: z.string().min(1).max(128),
  confirmarContrasena: z.string().min(1).max(128),
}).strict().refine((datos) => datos.nuevaContrasena === datos.confirmarContrasena,
  { message: 'Las contraseñas no coinciden.', path: ['confirmarContrasena'] });
