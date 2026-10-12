import { describe, expect, it, vi } from 'vitest';
import { UsuarioServicio } from './usuarioServicio.js';
import type { UsuarioRepositorio } from './usuarioRepositorio.js';

const administrador={usuarioId:'11111111-1111-4111-8111-111111111111',nombreCompleto:'Administrador',
  nombreUsuario:'sistemas',correo:null,codigoRol:'ADMINISTRADOR',nombreRol:'Administrador',activo:true,
  debeCambiarContrasena:false,ultimoAcceso:null,creadoEn:new Date().toISOString(),actualizadoEn:new Date().toISOString()};

describe('UsuarioServicio',()=>{
  it('permite una contraseña corta no vacía al crear',async()=>{const crear=vi.fn().mockResolvedValue(administrador);
    const repositorio={crear} as unknown as UsuarioRepositorio;
    await expect(new UsuarioServicio(repositorio).crear({nombreCompleto:administrador.nombreCompleto,
      nombreUsuario:administrador.nombreUsuario,correo:'',codigoRol:'ADMINISTRADOR',activo:true,contrasena:'123456'}))
      .resolves.toEqual(administrador);expect(crear).toHaveBeenCalledOnce();});
  it('impide la auto desactivación',async()=>{const repositorio={obtener:vi.fn().mockResolvedValue(administrador)} as unknown as UsuarioRepositorio;
    await expect(new UsuarioServicio(repositorio).cambiarEstado(administrador.usuarioId,false,administrador.usuarioId))
      .rejects.toMatchObject({codigo:'AUTO_DESACTIVACION_NO_PERMITIDA',estadoHttp:409});});
  it('impide desactivar el último administrador',async()=>{const repositorio={obtener:vi.fn().mockResolvedValue(administrador),
    contarAdministradoresActivos:vi.fn().mockResolvedValue(1),cambiarEstado:vi.fn()} as unknown as UsuarioRepositorio;
    await expect(new UsuarioServicio(repositorio).cambiarEstado(administrador.usuarioId,false,'22222222-2222-4222-8222-222222222222'))
      .rejects.toMatchObject({codigo:'ULTIMO_ADMINISTRADOR',estadoHttp:409});expect(repositorio.cambiarEstado).not.toHaveBeenCalled();});
  it('elimina lógicamente una cuenta permitida',async()=>{const eliminarLogicamente=vi.fn().mockResolvedValue(undefined);
    const repositorio={obtener:vi.fn().mockResolvedValue({...administrador,usuarioId:'33333333-3333-4333-8333-333333333333',codigoRol:'OPERADOR_BODEGA'}),
      eliminarLogicamente} as unknown as UsuarioRepositorio;
    await expect(new UsuarioServicio(repositorio).eliminar('33333333-3333-4333-8333-333333333333',administrador.usuarioId))
      .resolves.toBeUndefined();expect(eliminarLogicamente).toHaveBeenCalledWith('33333333-3333-4333-8333-333333333333');});
  it('impide que el administrador elimine su propia cuenta',async()=>{const eliminarLogicamente=vi.fn();
    const repositorio={obtener:vi.fn().mockResolvedValue(administrador),eliminarLogicamente} as unknown as UsuarioRepositorio;
    await expect(new UsuarioServicio(repositorio).eliminar(administrador.usuarioId,administrador.usuarioId))
      .rejects.toMatchObject({codigo:'AUTO_ELIMINACION_NO_PERMITIDA',estadoHttp:409});
    expect(eliminarLogicamente).not.toHaveBeenCalled();});
  it.each([[51002,'ULTIMO_ADMINISTRADOR'],[51003,'ASIGNACIONES_ACTIVAS']])(
    'traduce la protección SQL %s al eliminar',async(numero,codigo)=>{const repositorio={obtener:vi.fn().mockResolvedValue(administrador),
      eliminarLogicamente:vi.fn().mockRejectedValue({number:numero})} as unknown as UsuarioRepositorio;
      await expect(new UsuarioServicio(repositorio).eliminar(administrador.usuarioId,'22222222-2222-4222-8222-222222222222'))
        .rejects.toMatchObject({codigo,estadoHttp:409});});
});
