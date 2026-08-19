import { z } from 'zod';

export const rolesPermitidos = ['ADMINISTRADOR', 'OPERADOR_BODEGA', 'CONSULTA'] as const;
const correo = z.union([z.string().trim().email().max(254), z.literal('')]).optional();
export const esquemaListadoUsuarios = z.object({ busqueda: z.string().trim().max(150).optional(),
  rol: z.enum(rolesPermitidos).optional(), activo: z.enum(['true', 'false']).optional(),
  pagina: z.coerce.number().int().min(1).default(1),
  cantidadPorPagina: z.coerce.number().int().min(1).max(100).default(25) }).strict();
export const esquemaCrearUsuario = z.object({ nombreCompleto: z.string().trim().min(1).max(150),
  nombreUsuario: z.string().trim().min(1).max(100).regex(/^[\p{L}\p{N}._-]+$/u), correo,
  codigoRol: z.enum(rolesPermitidos), contrasena: z.string().min(1).max(128),
  confirmarContrasena: z.string().min(1).max(128), activo: z.boolean().default(true) })
  .strict().refine((valor) => valor.contrasena === valor.confirmarContrasena,
    { path: ['confirmarContrasena'], message: 'Las contraseñas no coinciden.' });
export const esquemaEditarUsuario = z.object({ nombreCompleto: z.string().trim().min(1).max(150),
  nombreUsuario: z.string().trim().min(1).max(100).regex(/^[\p{L}\p{N}._-]+$/u), correo,
  codigoRol: z.enum(rolesPermitidos) }).strict();
export const esquemaEstadoUsuario = z.object({ activo: z.boolean() }).strict();
export const esquemaRestablecer = z.object({ contrasena: z.string().min(1).max(128),
  confirmarContrasena: z.string().min(1).max(128) }).strict()
  .refine((valor) => valor.contrasena === valor.confirmarContrasena,
    { path: ['confirmarContrasena'], message: 'Las contraseñas no coinciden.' });
export const esquemaIdUsuario = z.string().uuid();
