import { describe, expect, it } from 'vitest';
import solicitud from 'supertest';
import { aplicacion } from '../src/aplicacion.js';

describe('GET /api/salud', () => {
  it('devuelve el estado básico sin información técnica sensible', async () => {
    const respuesta = await solicitud(aplicacion).get('/api/salud');

    expect(respuesta.status).toBe(200);
    expect(respuesta.headers['x-id-seguimiento']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(respuesta.body).toEqual({
      datos: {
        estado: 'disponible',
        fechaHora: expect.stringMatching(/^-?\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}-06:00$/),
      },
    });
    expect(JSON.stringify(respuesta.body)).not.toMatch(/contrase|sql|version/i);
  });

  it('devuelve un error controlado para una ruta inexistente', async () => {
    const respuesta = await solicitud(aplicacion).get('/api/no-existe');

    expect(respuesta.status).toBe(404);
    expect(respuesta.body).toEqual({
      codigo: 'RUTA_NO_ENCONTRADA',
      mensaje: 'La ruta solicitada no existe.',
      idSeguimiento: respuesta.headers['x-id-seguimiento'],
    });
  });
});

