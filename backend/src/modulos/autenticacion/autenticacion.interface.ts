export interface UsuarioAutenticacion {
  usuarioId: string;
  nombreUsuario: string;
  nombreVisible: string;
  hashContrasena: Buffer;
  algoritmoContrasena: string;
  codigoRol: string | null;
  codigoAlmacen: string | null;
  activo: boolean;
  debeCambiarContrasena: boolean;
  intentosFallidos: number;
  bloqueadoHasta: Date | null;
}

export interface IdentidadAutenticada {
  usuarioId: string;
  nombreUsuario: string;
  nombreVisible: string;
  codigoRol: string | null;
  codigoAlmacen: string | null;
  sesionId: string;
  debeCambiarContrasena: boolean;
}
