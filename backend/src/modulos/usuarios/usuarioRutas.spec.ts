import express, { type ErrorRequestHandler } from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ErrorAplicacion } from '../../compartido/errores/errorAplicacion.js';
import { usuarioRutas } from './usuarioRutas.js';
import { UsuarioServicio } from './usuarioServicio.js';

function aplicacion(rol: string) {
  const app=express();app.use(express.json());
  app.use((peticion,_respuesta,siguiente)=>{peticion.user={usuarioId:'11111111-1111-4111-8111-111111111111',
    nombreUsuario:'sistemas',nombreVisible:'Sistemas',codigoRol:rol,codigoAlmacen:null,
    sesionId:'sesion-prueba',debeCambiarContrasena:false};siguiente();});
  app.use('/api/usuarios',usuarioRutas);
  const errores:ErrorRequestHandler=(error,_peticion,respuesta,_siguiente)=>respuesta
    .status(error instanceof ErrorAplicacion?error.estadoHttp:500).json({mensaje:error.message});
  app.use(errores);return app;
}

describe('eliminación lógica de usuarios',()=>{
  afterEach(()=>vi.restoreAllMocks());
  it('permite eliminar exclusivamente a un administrador',async()=>{const eliminar=vi.spyOn(UsuarioServicio.prototype,'eliminar').mockResolvedValue();
    await request(aplicacion('ADMINISTRADOR')).delete('/api/usuarios/22222222-2222-4222-8222-222222222222').expect(204);
    expect(eliminar).toHaveBeenCalledWith('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111');});
  it('rechaza a un operador antes de ejecutar la eliminación',async()=>{const eliminar=vi.spyOn(UsuarioServicio.prototype,'eliminar').mockResolvedValue();
    await request(aplicacion('OPERADOR_BODEGA')).delete('/api/usuarios/22222222-2222-4222-8222-222222222222').expect(403);
    expect(eliminar).not.toHaveBeenCalled();});
});
