import { z } from "zod";
import { roles } from "../modelos/usuario.js";
const textoRequerido = (campo: string, maximo: number) =>
  z
    .string()
    .trim()
    .min(1, `${campo} es obligatorio`)
    .max(maximo, `${campo} es demasiado largo`);
export const registroUsuarioEsquema = z.object({
  sucursalId: z.number().int().positive(),
  nombres: textoRequerido("Los nombres", 80),
  apellidos: textoRequerido("Los apellidos", 80),
  nombreUsuario: textoRequerido("El nombre de usuario", 40).regex(
    /^[a-zA-Z0-9._-]+$/,
    "El nombre de usuario contiene caracteres no permitidos",
  ),
  correoElectronico: z
    .string()
    .trim()
    .email("El correo electrónico no es válido")
    .max(160),
  rol: z.enum(roles, { message: "El rol no es válido" }),
});
export const actualizacionUsuarioEsquema = registroUsuarioEsquema.extend({
  activo: z.boolean(),
  restablecerContrasena: z.boolean(),
});
export const inicioSesionEsquema = z.object({
  nombreUsuario: textoRequerido("El nombre de usuario", 40),
  contrasena: z.string().min(1, "La contraseña es obligatoria").max(200),
});
