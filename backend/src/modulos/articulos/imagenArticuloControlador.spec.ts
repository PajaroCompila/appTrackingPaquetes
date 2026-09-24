import express from 'express';
import solicitud from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { ErrorAplicacion } from '../../compartido/errores/errorAplicacion.js';
import type { ImagenArticuloRepositorio } from './imagenArticuloRepositorio.js';
import type { InventarioArticuloRepositorio } from './inventarioArticuloRepositorio.js';
import { crearInventarioArticuloRutas } from './inventarioArticuloRutas.js';

function aplicacionImagen(obtener: ReturnType<typeof vi.fn>) {
  const aplicacion = express();
  aplicacion.use('/api/articulos', crearInventarioArticuloRutas(
    {} as InventarioArticuloRepositorio,
    { obtener } as unknown as ImagenArticuloRepositorio,
  ));
  aplicacion.use((error: unknown, _peticion: express.Request, respuesta: express.Response, _siguiente: express.NextFunction) => {
    const controlado = error instanceof ErrorAplicacion
      ? error : new ErrorAplicacion(500, 'ERROR_INTERNO', 'Error');
    respuesta.status(controlado.estadoHttp).json({ codigo: controlado.codigo });
  });
  return aplicacion;
}

describe('GET /api/articulos/:codigoArticulo/imagen', () => {
  it('entrega la imagen con caché y responde 304 cuando el navegador ya la tiene', async () => {
    const obtener = vi.fn().mockResolvedValue({
      contenido: Buffer.from('imagen'), tipoContenido: 'image/png',
      modificadaEn: new Date('2026-09-23T12:00:00Z'),
    });

    const primera = await solicitud(aplicacionImagen(obtener)).get('/api/articulos/ART%20CON%20ESPACIO/imagen');
    expect(primera.status).toBe(200);
    expect(primera.headers['content-type']).toContain('image/png');
    expect(primera.headers['cache-control']).toBe('private, max-age=3600');
    expect(primera.headers.etag).toBeTruthy();
    expect(obtener).toHaveBeenCalledWith('ART CON ESPACIO');

    const cache = await solicitud(aplicacionImagen(obtener))
      .get('/api/articulos/ART%20CON%20ESPACIO/imagen').set('If-None-Match', primera.headers.etag!);
    expect(cache.status).toBe(304);
  });

  it('distingue la ausencia de imagen y valida el código', async () => {
    const obtener = vi.fn().mockResolvedValue(null);
    const ausente = await solicitud(aplicacionImagen(obtener)).get('/api/articulos/A1/imagen');
    expect(ausente.status).toBe(404);
    expect(ausente.body.codigo).toBe('IMAGEN_ARTICULO_NO_DISPONIBLE');

    const invalido = await solicitud(aplicacionImagen(obtener)).get('/api/articulos/%20/imagen');
    expect(invalido.status).toBe(400);
    expect(obtener).toHaveBeenCalledOnce();
  });
});
