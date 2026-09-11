import { describe, expect, it } from 'vitest';
import { compararDetalles } from './seguimientoPedidoRepositorio.js';

const linea = (
  identificadorDetalle: string,
  codigoArticulo: string,
  cantidad: number,
  codigoAlmacen: string,
) => ({
  idOrigen: 'R1:PRUEBA', identificadorDetalle, codigoArticulo,
  descripcion: `Artículo ${codigoArticulo}`, cantidad, codigoAlmacen,
});

describe('compararDetalles', () => {
  it('detecta altas, bajas, cantidades y bodegas sin depender del orden', () => {
    const anteriores = [linea('1', 'A1', 2, 'B1'), linea('2', 'A2', 1, 'B1'), linea('3', 'A3', 1, 'B1')];
    const actuales = [linea('4', 'A4', 1, 'B2'), linea('2', 'A2', 3, 'B1'), linea('1', 'A1', 2, 'B3')];

    expect(compararDetalles(anteriores, actuales).map(({ tipo, identificadorDetalle }) =>
      `${tipo}:${identificadorDetalle}`)).toEqual([
      'BODEGA:1', 'CANTIDAD:2', 'ELIMINADO:3', 'AGREGADO:4',
    ]);
  });

  it('ignora reordenamientos y cambios de mayúsculas ya normalizados', () => {
    const anteriores = [linea('1', 'A1', 2, 'B1'), linea('2', 'A2', 1, 'B2')];
    const actuales = [linea('2', 'A2', 1, 'B2'), linea('1', 'A1', 2, 'B1')];
    expect(compararDetalles(anteriores, actuales)).toEqual([]);
  });
});
