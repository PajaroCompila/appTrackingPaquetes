import { describe, expect, it, vi } from 'vitest';
import { ErrorAplicacion } from '../src/compartido/errores/errorAplicacion.js';
import type { IAlmacenRepositorio } from '../src/modulos/almacenes/almacenRepositorio.js';
import { AlmacenServicio } from '../src/modulos/almacenes/almacenServicio.js';

describe('AlmacenServicio', () => {
  it('devuelve almacenes con propiedades amigables', async () => {
    const almacenRepositorio: IAlmacenRepositorio = {
      obtenerAlmacenes: vi.fn().mockResolvedValue([
        {
          codigoAlmacen: 'BSPS01', nombreAlmacen: 'Bodega principal',
          codigoSucursal: 'SPS', nombreSucursal: 'San Pedro Sula_P',
        },
      ]),
    };
    const almacenServicio = new AlmacenServicio(almacenRepositorio);

    await expect(almacenServicio.obtenerAlmacenes()).resolves.toEqual([
      {
        codigoAlmacen: 'BSPS01', nombreAlmacen: 'Bodega principal',
        codigoSucursal: 'SPS', nombreSucursal: 'San Pedro Sula_P',
      },
    ]);
  });

  it('oculta errores técnicos del repositorio', async () => {
    const almacenRepositorio: IAlmacenRepositorio = {
      obtenerAlmacenes: vi.fn().mockRejectedValue(new Error('Error técnico de prueba')),
    };
    const almacenServicio = new AlmacenServicio(almacenRepositorio);

    await expect(almacenServicio.obtenerAlmacenes()).rejects.toEqual(
      new ErrorAplicacion(500, 'ERROR_CONSULTA_ALMACENES', 'No fue posible consultar los almacenes.'),
    );
  });
});
