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
  codigoRol = 'OPERADOR_BODEGA',
) {
  const aplicacion = express();
  aplicacion.use((peticion, _respuesta, siguiente) => {
    peticion.user = {
      usuarioId: '00000000-0000-0000-0000-000000000001',
      nombreUsuario,
      nombreVisible: nombreUsuario,
      codigoRol,
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
  it.each([
    ['operador', 'OPERADOR_BODEGA'],
    ['consulta', 'CONSULTA'],
    ['dashboard', 'DASHBOARDS'],
    ['gcruz', 'OPERADOR_BODEGA'],
    ['supervisor-admin', 'ADMINISTRADOR'],
    ['tlopez', 'OPERADOR_BODEGA'],
  ])('permite a %s buscar y consultar todas las bodegas', async (usuario, rol) => {
    const obtener = vi.fn().mockImplementation(async () => structuredClone(inventarioCompleto));
    const buscar = vi.fn().mockResolvedValue([]);
    const app = aplicacionInventario(usuario, obtener, buscar, rol);
    await solicitud(app).get('/api/articulos/buscar?termino=articulo').expect(200);
    expect(buscar).toHaveBeenCalledWith('articulo', 20);
    const general = await solicitud(app).get('/api/articulos/A1/inventario').expect(200);
    expect(general.body.existencias).toHaveLength(2);
    const otraBodega = await solicitud(app).get('/api/articulos/A1/inventario?codigoAlmacen=BSPS01').expect(200);
    expect(otraBodega.body.existencias).toHaveLength(2);
    expect(obtener).toHaveBeenLastCalledWith('A1', 'BSPS01');
  });
  it('rechaza búsquedas demasiado cortas sin consultar SAP', async () => {
    const buscar = vi.fn();
    const respuesta = await solicitud(aplicacionInventario('otro', vi.fn(), buscar))
      .get('/api/articulos/buscar?termino=a');
    expect(respuesta.status).toBe(400);
    expect(buscar).not.toHaveBeenCalled();
  });

});
