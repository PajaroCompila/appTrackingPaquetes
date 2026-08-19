import express from 'express';
import pinoHttp from 'pino-http';
import solicitud from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { manejarError } from '../src/compartido/middleware/error.middleware.js';
import { asignarIdSeguimiento } from '../src/compartido/middleware/seguimiento.middleware.js';
import { crearInventarioArticuloRutas } from '../src/modulos/articulos/inventarioArticuloRutas.js';
import { InventarioArticuloRepositorio } from '../src/modulos/articulos/inventarioArticuloRepositorio.js';

function crearAplicacion(repositorio: InventarioArticuloRepositorio) {
  const aplicacion = express();
  aplicacion.use(asignarIdSeguimiento);
  aplicacion.use(pinoHttp({ enabled: false }));
  aplicacion.use('/api/articulos', crearInventarioArticuloRutas(repositorio));
  aplicacion.use(manejarError);
  return aplicacion;
}

describe('inventario de artículo', () => {
  it.each([10, 0, -2.5, 1.75])('conserva la existencia física %s', async (existenciaFisica) => {
    const obtener = vi.fn().mockResolvedValue({
      codigoArticulo: 'A-01', descripcion: 'Artículo', codigoAlmacen: 'B01',
      nombreAlmacen: 'Bodega', existenciaFisica,
    });
    const respuesta = await solicitud(crearAplicacion({ obtener } as unknown as InventarioArticuloRepositorio))
      .get('/api/articulos/A-01/inventario?codigoAlmacen=B01');

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.existenciaFisica).toBe(existenciaFisica);
    expect(obtener).toHaveBeenCalledWith('A-01', 'B01');
  });

  it('rechaza parámetros inválidos y responde 404 cuando no existe relación', async () => {
    const repositorio = { obtener: vi.fn().mockResolvedValue(null) } as unknown as InventarioArticuloRepositorio;
    const aplicacion = crearAplicacion(repositorio);
    const [invalida, inexistente] = await Promise.all([
      solicitud(aplicacion).get('/api/articulos/A-01/inventario'),
      solicitud(aplicacion).get('/api/articulos/A-01/inventario?codigoAlmacen=NOEXISTE'),
    ]);
    expect(invalida.status).toBe(400);
    expect(inexistente.status).toBe(404);
  });

  it('parametriza el SELECT autorizado sin concatenar valores', async () => {
    const parametros = new Map<string, unknown>();
    let consulta = '';
    const solicitudSql = {
      input: vi.fn((nombre: string, _tipo: unknown, valor: unknown) => {
        parametros.set(nombre, valor); return solicitudSql;
      }),
    };
    const consultar = vi.fn(async (texto: string, configurar: (r: typeof solicitudSql) => typeof solicitudSql) => {
      consulta = texto; configurar(solicitudSql);
      return { recordset: [{
        codigoArticulo: ' A-01 ', descripcion: ' Artículo ', codigoAlmacen: ' B01 ',
        nombreAlmacen: ' Bodega ', existenciaFisica: 2, esAlmacenConsultado: 1,
      }] };
    });
    const repositorio = new InventarioArticuloRepositorio(consultar as never);
    const resultado = await repositorio.obtener('A-01', 'B01');

    expect(consulta).toContain('inventario.[OnHand] AS existenciaFisica');
    expect(consulta).toContain('articulo.[ItemCode] = @codigoArticulo');
    expect(consulta).toContain('inventario.[WhsCode] = @codigoAlmacen');
    expect(consulta).not.toContain('A-01');
    expect(parametros).toEqual(new Map([['codigoArticulo', 'A-01'], ['codigoAlmacen', 'B01']]));
    expect(resultado?.existenciaFisica).toBe(2);
    expect(resultado?.existencias).toEqual([
      { codigoAlmacen: 'B01', nombreAlmacen: 'Bodega', existenciaFisica: 2 },
    ]);
  });

  it('convierte una falla SAP en un error controlado', async () => {
    const repositorio = { obtener: vi.fn().mockRejectedValue(new Error('conexión')) } as unknown as InventarioArticuloRepositorio;
    const respuesta = await solicitud(crearAplicacion(repositorio))
      .get('/api/articulos/A-01/inventario?codigoAlmacen=B01');
    expect(respuesta.status).toBe(500);
    expect(respuesta.body.codigo).toBe('ERROR_CONSULTA_INVENTARIO');
  });
});
