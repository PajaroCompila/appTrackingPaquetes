declare global {
  namespace Express {
    interface Request {
      id: string;
      user?: {
        usuarioId: string;
        nombreUsuario: string;
        nombreVisible: string;
        codigoRol: string | null;
        codigoAlmacen: string | null;
        sesionId: string;
        debeCambiarContrasena: boolean;
      };
    }
  }
}

export {};
