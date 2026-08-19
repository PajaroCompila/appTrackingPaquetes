import { describe, expect, it } from 'vitest';
import {
  esquemaFiltroDetallePedido,
  esquemaFiltrosPedidos,
} from '../src/modulos/pedidos/pedidoValidacion.js';

describe('validación de filtros de pedidos', () => {
  it('acepta uno o varios almacenes, elimina vacíos y duplicados', () => {
    const varios = esquemaFiltrosPedidos.parse({
      codigoAlmacen: [' BSPS01 ', 'BSPS02', 'BSPS01', ''],
    });
    const uno = esquemaFiltrosPedidos.parse({ codigoAlmacen: 'BSPS03' });

    expect(varios.codigosAlmacen).toEqual(['BSPS01', 'BSPS02']);
    expect(uno.codigosAlmacen).toEqual(['BSPS03']);
  });

  it('interpreta la ausencia de almacenes como todos', () => {
    expect(esquemaFiltrosPedidos.parse({}).codigosAlmacen).toEqual([]);
  });

  it('rechaza códigos inválidos, demasiado largos o demasiadas selecciones', () => {
    expect(esquemaFiltrosPedidos.safeParse({ codigoAlmacen: 'BOD 01' }).success).toBe(false);
    expect(esquemaFiltrosPedidos.safeParse({ codigoAlmacen: 'A'.repeat(17) }).success).toBe(false);
    expect(esquemaFiltrosPedidos.safeParse({
      codigoAlmacen: Array.from({ length: 51 }, (_, indice) => `B${indice}`),
    }).success).toBe(false);
  });
});

describe('esquemaFiltroDetallePedido', () => {
  it('normaliza múltiples bodegas para el detalle', () => {
    expect(esquemaFiltroDetallePedido.parse({
      codigoAlmacen: [' BSPS01 ', 'BSPS02', 'BSPS01'],
    }).codigosAlmacen).toEqual(['BSPS01', 'BSPS02']);
  });
});
