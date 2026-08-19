import express from 'express';
import pinoHttp from 'pino-http';
import solicitud from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { manejarError, manejarRutaNoEncontrada } from '../src/compartido/middleware/error.middleware.js';
import { asignarIdSeguimiento } from '../src/compartido/middleware/seguimiento.middleware.js';
import type { IPedidoRepositorio } from '../src/modulos/pedidos/pedidoRepositorio.js';
import { crearPedidoRutas } from '../src/modulos/pedidos/pedidoRutas.js';

function crearAplicacionPrueba(repositorio: IPedidoRepositorio) {
  const aplicacion = express();
  aplicacion.use(asignarIdSeguimiento);
  aplicacion.use(pinoHttp({ enabled: false }));
  aplicacion.use('/api/pedidos', crearPedidoRutas(repositorio));
  aplicacion.use(manejarRutaNoEncontrada);
  aplicacion.use(manejarError);
  return aplicacion;
}

function crearRepositorio(): IPedidoRepositorio {
  return {
    buscarPedidos: vi.fn().mockResolvedValue({
      pedidos: [], pagina: 1, cantidadPorPagina: 25, totalRegistros: 0, hayMas: false,
    }),
    obtenerDetallePedido: vi.fn().mockResolvedValue(null),
  };
}

describe('rutas de pedidos', () => {
  it('aplica paginación predeterminada', async () => {
    const repositorio = crearRepositorio();
    const respuesta = await solicitud(crearAplicacionPrueba(repositorio)).get('/api/pedidos');

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.paginacion).toEqual({
      pagina: 1, cantidadPorPagina: 25, cantidadDevuelta: 0, totalRegistros: 0, hayMas: false,
    });
    expect(repositorio.buscarPedidos).toHaveBeenCalledWith({
      pagina: 1, cantidadPorPagina: 25, codigosAlmacen: [],
    });
  });

  it('rechaza más de 100 registros y fechas invertidas', async () => {
    const aplicacion = crearAplicacionPrueba(crearRepositorio());
    const [limite, fechas] = await Promise.all([
      solicitud(aplicacion).get('/api/pedidos?cantidadPorPagina=101'),
      solicitud(aplicacion).get('/api/pedidos?fechaDesde=2026-07-31&fechaHasta=2026-07-30'),
    ]);

    expect(limite.status).toBe(400);
    expect(fechas.status).toBe(400);
  });

  it('devuelve 404 para un pedido inexistente', async () => {
    const respuesta = await solicitud(crearAplicacionPrueba(crearRepositorio()))
      .get('/api/pedidos/INEXISTENTE');

    expect(respuesta.status).toBe(404);
    expect(respuesta.body.codigo).toBe('PEDIDO_NO_ENCONTRADO');
  });
});
