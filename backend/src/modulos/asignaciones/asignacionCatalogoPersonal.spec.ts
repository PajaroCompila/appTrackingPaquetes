import express, { type ErrorRequestHandler } from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { ErrorAplicacion } from '../../compartido/errores/errorAplicacion.js';
import type { PersonalAsignableServicio } from '../personalAsignable/personalAsignableServicio.js';
import type { AsignacionRepositorio } from './asignacionRepositorio.js';
import { crearAsignacionRutas } from './asignacionRutas.js';

function aplicacion(repositorio: AsignacionRepositorio, catalogo: Pick<PersonalAsignableServicio,
  'listarParaSesion' | 'resolverParaSesion'>) {
  const app = express();
  app.use(express.json());
  app.use((peticion, _respuesta, siguiente) => {
    peticion.user = { usuarioId: '11111111-1111-4111-8111-111111111111', nombreUsuario: 'sistemas',
      nombreVisible: 'Sistemas', codigoRol: 'ADMINISTRADOR', codigoAlmacen: null,
      sesionId: 'sesion', debeCambiarContrasena: false };
    siguiente();
  });
  app.use('/asignaciones', crearAsignacionRutas(repositorio, catalogo));
  const errores: ErrorRequestHandler = (error, _peticion, respuesta, _siguiente) => {
    void _siguiente;
    respuesta.status(error instanceof ErrorAplicacion ? error.estadoHttp : 500)
      .json({ mensaje: error.message });
  };
  app.use(errores);
  return app;
}

describe('integración del catálogo con ASIGNADO A', () => {
  it('expone y permite usar inmediatamente una persona nueva sin cuenta de acceso', async () => {
    const tecnico = { usuario: 'PERSONAL:333', nombre: 'Ángel Zelaya' };
    const catalogo = { listarParaSesion: vi.fn().mockResolvedValue([tecnico]),
      resolverParaSesion: vi.fn().mockResolvedValue(tecnico) };
    const guardar = vi.fn().mockResolvedValue({ confirmada: true, asignacion: {
      idOrigen: 'R1:TSPS01:F1', identificadorDetalle: '1', usuarioAsignado: tecnico.usuario,
      nombreAsignado: tecnico.nombre, asignadoEn: new Date(), actualizadoEn: new Date(),
    } });
    const app = aplicacion({ guardar } as unknown as AsignacionRepositorio, catalogo);
    const lista = await request(app).get('/asignaciones/usuarios').expect(200);
    expect(lista.body.datos).toEqual([tecnico]);
    await request(app).patch('/asignaciones').send({ idOrigen: 'R1:TSPS01:F1',
      identificadorDetalle: '1', usuarioAsignado: tecnico.usuario }).expect(200);
    expect(catalogo.resolverParaSesion).toHaveBeenCalledWith(expect.objectContaining({
      codigoRol: 'ADMINISTRADOR' }), tecnico.usuario);
    expect(guardar).toHaveBeenCalledWith(expect.anything(), tecnico,
      '11111111-1111-4111-8111-111111111111');
  });
});
