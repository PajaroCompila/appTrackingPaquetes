import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { aplicacion } from '../src/aplicacion.js';

describe('protecciÃ³n de rutas internas', () => {
  it('rechaza el acceso a pedidos cuando no existe sesiÃ³n', async () => {
    const respuesta = await request(aplicacion).get('/api/pedidos');
    expect(respuesta.status).toBe(401);
    expect(respuesta.body.codigo).toBe('SESION_REQUERIDA');
    expect(respuesta.body).not.toHaveProperty('token');
  });
});
