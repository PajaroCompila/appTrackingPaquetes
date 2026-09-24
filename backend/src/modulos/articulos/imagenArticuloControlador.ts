import { createHash } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { ErrorAplicacion } from '../../compartido/errores/errorAplicacion.js';
import type { ImagenArticuloRepositorio } from './imagenArticuloRepositorio.js';
import { esquemaCodigoArticulo } from './inventarioArticuloValidacion.js';

export class ImagenArticuloControlador {
  public constructor(private readonly repositorio: ImagenArticuloRepositorio) {}

  public obtener = async (
    solicitud: Request<{ codigoArticulo: string }>,
    respuesta: Response,
    siguiente: NextFunction,
  ): Promise<void> => {
    const articulo = esquemaCodigoArticulo.safeParse(solicitud.params.codigoArticulo);
    if (!articulo.success) {
      siguiente(new ErrorAplicacion(400, 'CODIGO_ARTICULO_INVALIDO', 'El código del artículo no es válido.'));
      return;
    }

    try {
      const imagen = await this.repositorio.obtener(articulo.data);
      if (!imagen) {
        siguiente(new ErrorAplicacion(404, 'IMAGEN_ARTICULO_NO_DISPONIBLE', 'El artículo no tiene una imagen disponible.'));
        return;
      }

      const etiqueta = `"${createHash('sha256').update(imagen.contenido).digest('base64url')}"`;
      respuesta.set({
        'Cache-Control': 'private, max-age=3600',
        'Content-Type': imagen.tipoContenido,
        ETag: etiqueta,
        'Last-Modified': imagen.modificadaEn.toUTCString(),
      });
      if (solicitud.headers['if-none-match'] === etiqueta) {
        respuesta.status(304).end();
        return;
      }
      respuesta.status(200).send(imagen.contenido);
    } catch (error) {
      if (error instanceof ErrorAplicacion) {
        siguiente(error);
        return;
      }
      siguiente(new ErrorAplicacion(500, 'ERROR_IMAGEN_ARTICULO', 'No fue posible obtener la imagen del artículo.'));
    }
  };
}
