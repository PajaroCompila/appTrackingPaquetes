export type Rol = 'usuario' | 'supervisor' | 'administrador';
export interface IdentidadAutenticada {
  usuarioId: number;
  nombreUsuario: string;
  rol: Rol;
  sucursalId: number;
}
