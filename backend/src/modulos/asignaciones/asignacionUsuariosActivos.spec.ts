import express, { type ErrorRequestHandler } from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { ErrorAplicacion } from '../../compartido/errores/errorAplicacion.js';
import { AsignacionRepositorio } from './asignacionRepositorio.js';
import { crearAsignacionRutas } from './asignacionRutas.js';

function appCon(repositorio: AsignacionRepositorio) {
  const app=express();app.use(express.json());
  app.use((peticion,_respuesta,siguiente)=>{peticion.user={usuarioId:'11111111-1111-4111-8111-111111111111',
    nombreUsuario:'sistemas',nombreVisible:'Sistemas',codigoRol:'ADMINISTRADOR',codigoAlmacen:null,
    sesionId:'sesion-prueba',debeCambiarContrasena:false};siguiente();});
  app.use('/asignaciones',crearAsignacionRutas(repositorio));
  const errores:ErrorRequestHandler=(error,_peticion,respuesta,_siguiente)=>respuesta
    .status(error instanceof ErrorAplicacion?error.estadoHttp:500).json({codigo:error.codigo,mensaje:error.message});
  app.use(errores);return app;
}

describe('usuarios activos en asignaciones',()=>{
  it('no ofrece cuentas eliminadas en el catálogo',async()=>{const filtrarUsuariosActivos=vi.fn().mockResolvedValue(new Set(['mperez']));
    const respuesta=await request(appCon({filtrarUsuariosActivos} as unknown as AsignacionRepositorio))
      .get('/asignaciones/usuarios').expect(200);
    expect(respuesta.body.datos).toEqual([{usuario:'mperez',nombre:'Marcos Perez'}]);
  });
  it('rechaza por backend una asignación directa hacia una cuenta inactiva',async()=>{
    const guardar=vi.fn();const filtrarUsuariosActivos=vi.fn().mockResolvedValue(new Set());
    const respuesta=await request(appCon({guardar,filtrarUsuariosActivos} as unknown as AsignacionRepositorio))
      .patch('/asignaciones').send({idOrigen:'R1:TSPS01:F1',identificadorDetalle:'1',usuarioAsignado:'mperez'})
      .expect(409);
    expect(respuesta.body.codigo).toBe('TECNICO_INACTIVO');expect(guardar).not.toHaveBeenCalled();
  });
});
