import express from 'express';
import solicitud from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { ErrorAplicacion } from '../../compartido/errores/errorAplicacion.js';
import { crearInventarioArticuloRutas } from './inventarioArticuloRutas.js';
import type { InventarioArticuloRepositorio } from './inventarioArticuloRepositorio.js';

function aplicacionInventario(
  nombreUsuario: string,
  obtener: ReturnType<typeof vi.fn>,
  buscar: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue([]),
) {
  const aplicacion = express();
  aplicacion.use((peticion, _respuesta, siguiente) => {
    peticion.user = {
      usuarioId: '00000000-0000-0000-0000-000000000001',
      nombreUsuario,
      nombreVisible: nombreUsuario,
      codigoRol: 'OPERADOR_BODEGA',
      codigoAlmacen: 'TCIR01',
      codigosAlmacenVisibles: ['TCIR01'],
      sesionId: 'sesion-prueba',
      debeCambiarContrasena: false,
    };
    siguiente();
  });
  aplicacion.use('/api/articulos', crearInventarioArticuloRutas({
    obtener, buscar,
  } as unknown as InventarioArticuloRepositorio));
  aplicacion.use((
    error: unknown,
    _peticion: express.Request,
    respuesta: express.Response,
    _siguiente: express.NextFunction,
  ) => {
    const controlado = error instanceof ErrorAplicacion
      ? error
      : new ErrorAplicacion(500, 'ERROR_INTERNO', 'Error');
    respuesta.status(controlado.estadoHttp).json({ codigo: controlado.codigo });
  });
  return aplicacion;
}

const inventarioCompleto = {
  codigoArticulo: 'A1',
  descripcion: 'Artículo de prueba',
  codigoAlmacen: 'TCIR01',
  nombreAlmacen: 'Circunvalación',
  existenciaFisica: 2,
  existencias: [
    { codigoAlmacen: 'TCIR01', nombreAlmacen: 'Circunvalación', existenciaFisica: 2 },
    { codigoAlmacen: 'BSPS01', nombreAlmacen: 'Bodega principal', existenciaFisica: 8 },
  ],
};

describe('acceso al inventario por almacén', () => {
  it('busca coincidencias respetando las bodegas visibles', async () => {
    const buscar = vi.fn().mockResolvedValue([
      { codigoArticulo: 'A1', descripcion: 'Artículo de prueba' },
    ]);
    const respuesta = await solicitud(aplicacionInventario('otro', vi.fn(), buscar))
      .get('/api/articulos/buscar?termino=articulo');

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.datos).toEqual([
      { codigoArticulo: 'A1', descripcion: 'Artículo de prueba' },
    ]);
    expect(buscar).toHaveBeenCalledWith('articulo', 20, ['TCIR01']);
  });

  it('rechaza búsquedas demasiado cortas sin consultar SAP', async () => {
    const buscar = vi.fn();
    const respuesta = await solicitud(aplicacionInventario('otro', vi.fn(), buscar))
      .get('/api/articulos/buscar?termino=a');
    expect(respuesta.status).toBe(400);
    expect(buscar).not.toHaveBeenCalled();
  });

  it('muestra a Tommy las existencias de todas las bodegas', async () => {
    const obtener = vi.fn().mockResolvedValue(structuredClone(inventarioCompleto));

    const respuesta = await solicitud(aplicacionInventario('tlopez', obtener))
      .get('/api/articulos/A1/inventario?codigoAlmacen=TCIR01');

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.existencias.map(({ codigoAlmacen }: { codigoAlmacen: string }) =>
      codigoAlmacen)).toEqual(['TCIR01', 'BSPS01']);
  });

  it('conserva el filtro de almacenes para otro usuario restringido', async () => {
    const obtener = vi.fn().mockResolvedValue(structuredClone(inventarioCompleto));

    const respuesta = await solicitud(aplicacionInventario('otro', obtener))
      .get('/api/articulos/A1/inventario?codigoAlmacen=TCIR01');

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.existencias.map(({ codigoAlmacen }: { codigoAlmacen: string }) =>
      codigoAlmacen)).toEqual(['TCIR01']);
  });

  it('permite la consulta por código y limita la respuesta a las bodegas autorizadas', async () => {
    const obtener = vi.fn().mockResolvedValue(structuredClone(inventarioCompleto));

    const respuesta = await solicitud(aplicacionInventario('otro', obtener))
      .get('/api/articulos/A1/inventario');

    expect(respuesta.status).toBe(200);
    expect(obtener).toHaveBeenCalledWith('A1', undefined);
    expect(respuesta.body.codigoAlmacen).toBe('TCIR01');
    expect(respuesta.body.existencias).toEqual([
      { codigoAlmacen: 'TCIR01', nombreAlmacen: 'Circunvalación', existenciaFisica: 2 },
    ]);
  });

  it('mantiene todas las bodegas en la consulta general autorizada para Tommy', async () => {
    const obtener = vi.fn().mockResolvedValue(structuredClone(inventarioCompleto));

    const respuesta = await solicitud(aplicacionInventario('tlopez', obtener))
      .get('/api/articulos/A1/inventario');

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.existencias).toHaveLength(2);
  });
});
