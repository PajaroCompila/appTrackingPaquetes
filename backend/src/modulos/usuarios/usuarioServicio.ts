import { ErrorAplicacion } from '../../compartido/errores/errorAplicacion.js';
import { crearHashContrasena } from '../autenticacion/autenticacionServicio.js';
import { UsuarioRepositorio, type DatosUsuario } from './usuarioRepositorio.js';
import { AlmacenRepositorio } from '../almacenes/almacenRepositorio.js';

function traducirError(error: unknown): never {
  const numero = typeof error === 'object' && error !== null && 'number' in error
    ? Number((error as { number: unknown }).number) : 0;
  if (numero === 2601 || numero === 2627) throw new ErrorAplicacion(409, 'USUARIO_DUPLICADO',
    'El nombre de usuario o correo ya está registrado.');
  if (numero === 51001) throw new ErrorAplicacion(404, 'ROL_NO_ENCONTRADO', 'El rol no existe o está inactivo.');
  throw error;
}

export class UsuarioServicio {
  public constructor(private readonly repositorio=new UsuarioRepositorio(),private readonly almacenes=new AlmacenRepositorio()){}
  public listar(f:Parameters<UsuarioRepositorio['listar']>[0]){return this.repositorio.listar(f);}
  public async obtener(id:string){const usuario=await this.repositorio.obtener(id);if(!usuario)throw new ErrorAplicacion(404,'USUARIO_NO_ENCONTRADO','El usuario no existe.');return usuario;}
  public async crear(d:DatosUsuario&{contrasena:string}){try{return await this.repositorio.crear(d,
    await crearHashContrasena(d.contrasena,d.nombreUsuario));}catch(e){traducirError(e);}}
  public async editar(id:string,d:DatosUsuario){await this.obtener(id);try{return await this.repositorio.editar(id,d);}catch(e){traducirError(e);}}
  public async cambiarEstado(id:string,activo:boolean,actual:string){const usuario=await this.obtener(id);
    if(!activo&&id===actual)throw new ErrorAplicacion(409,'AUTO_DESACTIVACION_NO_PERMITIDA','No podés desactivar tu propia cuenta.');
    if(!activo&&usuario.codigoRol==='ADMINISTRADOR'&&await this.repositorio.contarAdministradoresActivos()<=1)
      throw new ErrorAplicacion(409,'ULTIMO_ADMINISTRADOR','No se puede desactivar el último administrador activo.');
    await this.repositorio.cambiarEstado(id,activo);return this.obtener(id);}
  public async restablecer(id:string,contrasena:string){const usuario=await this.obtener(id);
    await this.repositorio.restablecer(id,await crearHashContrasena(contrasena,usuario.nombreUsuario));}
  public roles(){return this.repositorio.roles();}
  public almacenesDisponibles(){return this.almacenes.obtenerAlmacenes();}
  public async guardarAlmacenes(id:string,codigos:string[]){await this.obtener(id);
    const disponibles=await this.almacenes.obtenerAlmacenes();const permitidos=new Set(disponibles.map(({codigoAlmacen})=>codigoAlmacen.toUpperCase()));
    if(codigos.some((codigo)=>!permitidos.has(codigo.toUpperCase())))throw new ErrorAplicacion(400,'ALMACEN_NO_PERMITIDO','Una de las bodegas seleccionadas no existe.');
    await this.repositorio.guardarAlmacenes(id,codigos);return this.obtener(id);}
}
