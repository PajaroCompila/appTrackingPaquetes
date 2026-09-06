export const roles = ["usuario", "supervisor", "administrador"] as const;
export type Rol = (typeof roles)[number];
export interface IdentidadAutenticada {
  usuarioId: number;
  nombreUsuario: string;
  rol: Rol;
  sucursalId: number;
}
export interface UsuarioGuardado extends IdentidadAutenticada {
  sucursalId: number;
  nombreSucursal: string;
  nombres: string;
  apellidos: string;
  correoElectronico: string;
  activo: boolean;
  contrasenaHash: string;
  debeCambiarContrasena: boolean;
  fechaCreacion: Date;
}
export interface UsuarioPublico extends IdentidadAutenticada {
  sucursalId: number;
  nombreSucursal: string;
  nombres: string;
  apellidos: string;
  correoElectronico: string;
  activo: boolean;
  debeCambiarContrasena: boolean;
  fechaCreacion: Date;
}
export interface NuevoUsuario {
  sucursalId: number;
  nombres: string;
  apellidos: string;
  nombreUsuario: string;
  correoElectronico: string;
  rol: Rol;
  contrasenaHash: string;
}
export interface RegistroUsuario {
  sucursalId: number;
  nombres: string;
  apellidos: string;
  nombreUsuario: string;
  correoElectronico: string;
  rol: Rol;
}
export interface ActualizacionUsuario extends RegistroUsuario {
  activo: boolean;
  restablecerContrasena: boolean;
}

export interface CambiosUsuario extends RegistroUsuario {
  activo: boolean;
  contrasenaHash?: string;
}

export interface Sucursal {
  sucursalId: number;
  nombre: string;
  codigo: string;
  direccion: string;
  departamentoCodigo: string;
  departamento: string;
  ciudadCodigo: string;
  ciudad: string;
  telefono: string;
  activo: boolean;
  fechaCreacion: Date;
}

export interface Departamento {
  codigo: string;
  nombre: string;
  cabecera: string;
}

export interface Ciudad {
  codigo: string;
  departamentoCodigo: string;
  nombre: string;
}
