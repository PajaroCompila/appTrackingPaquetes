import express from 'express';
import request from 'supertest';
import { afterEach, expect, it, vi } from 'vitest';
import { autenticacionRutas } from './autenticacionRutas.js';
import { AutenticacionServicio } from './autenticacionServicio.js';
import { ErrorAplicacion } from '../../compartido/errores/errorAplicacion.js';

afterEach(() => vi.restoreAllMocks());

it('procesa intentos repetidos desde la misma IP sin límite ni respuesta 429', async () => {
  const iniciar = vi.spyOn(AutenticacionServicio.prototype, 'iniciarSesion')
    .mockRejectedValue(new ErrorAplicacion(401, 'CREDENCIALES_INVALIDAS', 'Credenciales incorrectas'));
  const app = express();
  app.use(express.json());
  app.use('/auth', autenticacionRutas);
  app.use((error: ErrorAplicacion, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(error.estadoHttp).json({ codigo: error.codigo });
  });
  for (let intento = 0; intento < 12; intento++) {
    const respuesta = await request(app).post('/auth/iniciar-sesion')
      .send({ nombreUsuario: 'operador', contrasena: 'incorrecta' });
    expect(respuesta.status).toBe(401);
    expect(respuesta.headers['ratelimit']).toBeUndefined();
    expect(respuesta.headers['retry-after']).toBeUndefined();
  }
  expect(iniciar).toHaveBeenCalledTimes(12);
});
