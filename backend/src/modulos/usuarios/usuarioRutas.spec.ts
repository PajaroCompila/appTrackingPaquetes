import express, { type ErrorRequestHandler } from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ErrorAplicacion } from '../../compartido/errores/errorAplicacion.js';
import { usuarioRutas } from './usuarioRutas.js';
import { UsuarioServicio } from './usuarioServicio.js';
import { PersonalAsignableServicio } from '../personalAsignable/personalAsignableServicio.js';

function aplicacion(rol: string) {
  const app=express();app.use(express.json());
  app.use((peticion,_respuesta,siguiente)=>{peticion.user={usuarioId:'11111111-1111-4111-8111-111111111111',
    nombreUsuario:'sistemas',nombreVisible:'Sistemas',codigoRol:rol,codigoAlmacen:null,
    sesionId:'sesion-prueba',debeCambiarContrasena:false};siguiente();});
  app.use('/api/usuarios',usuarioRutas);
  const errores:ErrorRequestHandler=(error,_peticion,respuesta,_siguiente)=>{void _siguiente;respuesta
    .status(error instanceof ErrorAplicacion?error.estadoHttp:500).json({mensaje:error.message});};
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

describe('administración de personal asignable',()=>{
  afterEach(()=>vi.restoreAllMocks());
  it('permite al administrador listar y registrar una persona sin credenciales',async()=>{
    const persona={idPersonal:'33333333-3333-4333-8333-333333333333',codigoAsignacion:'PERSONAL:333',
      nombre:'Ángel',apellido:'Zelaya',nombreCompleto:'Ángel Zelaya',ambito:'GENERAL',activo:true,
      fechaCreacion:'2026-10-13T12:00:00.000Z'} as const;
    vi.spyOn(PersonalAsignableServicio.prototype,'listarAdministracion').mockResolvedValue([persona]);
    const crear=vi.spyOn(PersonalAsignableServicio.prototype,'crear').mockResolvedValue(persona);
    const app=aplicacion('ADMINISTRADOR');
    const listado=await request(app).get('/api/usuarios/personal-asignable').expect(200);
    expect(listado.body.datos).toEqual([persona]);
    await request(app).post('/api/usuarios/personal-asignable')
      .send({nombre:'  Ángel ',apellido:' Zelaya '}).expect(201);
    expect(crear).toHaveBeenCalledWith({nombre:'Ángel',apellido:'Zelaya'},
      '11111111-1111-4111-8111-111111111111');
  });

  it('exige nombre y apellido y bloquea a quienes no son administradores',async()=>{
    const crear=vi.spyOn(PersonalAsignableServicio.prototype,'crear');
    await request(aplicacion('ADMINISTRADOR')).post('/api/usuarios/personal-asignable')
      .send({nombre:'Ana',apellido:''}).expect(400);
    await request(aplicacion('OPERADOR_BODEGA')).post('/api/usuarios/personal-asignable')
      .send({nombre:'Ana',apellido:'Calix'}).expect(403);
    expect(crear).not.toHaveBeenCalled();
  });
});
