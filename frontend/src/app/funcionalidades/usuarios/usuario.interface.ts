export type CodigoRol='ADMINISTRADOR'|'OPERADOR_BODEGA'|'CONSULTA'|'DASHBOARDS'|'INVENTARIO';
export interface UsuarioLocal{usuarioId:string;nombreCompleto:string;nombreUsuario:string;correo:string|null;codigoRol:CodigoRol;nombreRol:string;activo:boolean;debeCambiarContrasena:boolean;ultimoAcceso:string|null;creadoEn:string;actualizadoEn:string;codigosAlmacenVisibles:string[]}
export interface RolLocal{rolId:string;codigo:CodigoRol;nombre:string;descripcion:string;activo:boolean}
export interface PersonalAsignableLocal {
  idPersonal: string;
  codigoAsignacion: string;
  nombre: string;
  apellido: string;
  nombreCompleto: string;
  ambito: 'GENERAL' | 'ACALIX_JLARA' | 'TCIR01' | 'TTBM01';
  activo: boolean;
  fechaCreacion: string;
}
