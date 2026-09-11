import express from 'express';
import solicitud from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { crearInventarioArticuloRutas } from './inventarioArticuloRutas.js';
import type { InventarioArticuloRepositorio } from './inventarioArticuloRepositorio.js';

function aplicacionInventario(nombreUsuario: string, obtener: ReturnType<typeof vi.fn>) {
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
    obtener,
  } as unknown as InventarioArticuloRepositorio));
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
});
