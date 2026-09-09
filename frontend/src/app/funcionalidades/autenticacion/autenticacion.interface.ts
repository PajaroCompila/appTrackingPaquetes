export interface UsuarioSesion { usuarioId: string; nombreUsuario: string; nombreVisible: string; codigoRol: 'ADMINISTRADOR'|'OPERADOR_BODEGA'|'CONSULTA'|null; codigoAlmacen: string | null; codigosAlmacenVisibles?: string[]; debeCambiarContrasena: boolean; }
export interface RespuestaSesion { usuario: UsuarioSesion; }
