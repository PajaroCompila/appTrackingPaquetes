import jwt, { type Secret, type SignOptions } from "jsonwebtoken";
import type { IdentidadAutenticada } from "../modelos/usuario.js";
import { ErrorAplicacion } from "../utilidades/errorAplicacion.js";
export class ServicioSesion {
  constructor(
    private readonly secreto: string,
    private readonly duracion: string,
  ) {}
  crearToken(identidad: IdentidadAutenticada): string {
    return jwt.sign(identidad, this.secreto as Secret, {
      expiresIn: this.duracion as SignOptions["expiresIn"],
    });
  }
  validarToken(token: string): IdentidadAutenticada {
    try {
      const contenido = jwt.verify(token, this.secreto as Secret);
      if (
        typeof contenido === "string" ||
        typeof contenido.usuarioId !== "number" ||
        typeof contenido.nombreUsuario !== "string" ||
        typeof contenido.sucursalId !== "number" ||
        !["usuario", "supervisor", "administrador"].includes(
          String(contenido.rol),
        )
      )
        throw new Error("Token incompleto");
      return {
        usuarioId: contenido.usuarioId,
        nombreUsuario: contenido.nombreUsuario,
        rol: contenido.rol as IdentidadAutenticada["rol"],
        sucursalId: contenido.sucursalId,
        nombreCompleto: typeof contenido.nombreCompleto === "string" ? contenido.nombreCompleto : contenido.nombreUsuario,
      };
    } catch {
      throw new ErrorAplicacion(
        401,
        "SESION_INVALIDA",
        "La sesión no es válida",
      );
    }
  }
}
