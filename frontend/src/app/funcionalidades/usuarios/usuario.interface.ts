export type CodigoRol='ADMINISTRADOR'|'OPERADOR_BODEGA'|'CONSULTA';
export interface UsuarioLocal{usuarioId:string;nombreCompleto:string;nombreUsuario:string;correo:string|null;codigoRol:CodigoRol;nombreRol:string;activo:boolean;debeCambiarContrasena:boolean;ultimoAcceso:string|null;creadoEn:string;actualizadoEn:string}
export interface RolLocal{rolId:string;codigo:CodigoRol;nombre:string;descripcion:string;activo:boolean}
