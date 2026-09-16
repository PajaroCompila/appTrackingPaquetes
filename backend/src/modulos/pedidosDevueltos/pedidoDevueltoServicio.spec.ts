import { describe, expect, it } from 'vitest';
import { calcularEstadoDevolucion, crearDevolucionDesdeDespacho, puedeConfirmarLinea } from './pedidoDevueltoServicio.js';

describe('pedidoDevueltoServicio', () => {
  it('no crea devolución cuando el pedido nunca fue despachado', () => {
    const pedido = {
      idOrigen: 'R1:PED-1',
      numeroPedido: '1001',
      nombreVendedor: 'SPS José Jahir',
      fechaHoraPedido: '2026-09-16T09:00:00Z',
      fechaCancelacion: '2026-09-16T12:00:00Z',
      motivo: 'Pedido cancelado',
      lineas: [
        { identificadorDetalle: '1', codigoArticulo: 'A1', descripcion: 'Articulo A', cantidad: 1, codigoAlmacen: 'BSPS03' },
      ],
      fueDespachado: false,
    };

    expect(crearDevolucionDesdeDespacho(pedido)).toBeNull();
  });

  it('crea devolución pendiente cuando hubo despacho previo a cierre o cancelación', () => {
    const pedido = {
      idOrigen: 'R1:PED-2',
      numeroPedido: '1002',
      nombreVendedor: 'SPS José Jahir',
      fechaHoraPedido: '2026-09-16T09:00:00Z',
      fechaCancelacion: '2026-09-16T12:00:00Z',
      motivo: 'Pedido cancelado',
      lineas: [
        { identificadorDetalle: '1', codigoArticulo: 'A1', descripcion: 'Articulo A', cantidad: 1, codigoAlmacen: 'BSPS03' },
        { identificadorDetalle: '2', codigoArticulo: 'B1', descripcion: 'Articulo B', cantidad: 2, codigoAlmacen: 'BSPS02' },
      ],
      fueDespachado: true,
    };

    const devolucion = crearDevolucionDesdeDespacho(pedido);
    expect(devolucion).not.toBeNull();
    expect(devolucion?.estado).toBe('PENDIENTE DE DEVOLUCIÓN');
    expect(devolucion?.lineas).toHaveLength(2);
    expect(devolucion?.idClave).toBe('R1:PED-2');
  });

  it('mantiene la bodega original en cada línea', () => {
    const devolucion = crearDevolucionDesdeDespacho({
      idOrigen: 'R1:PED-3',
      numeroPedido: '1003',
      nombreVendedor: 'SPS José Jahir',
      fechaHoraPedido: '2026-09-16T09:00:00Z',
      fechaCancelacion: '2026-09-16T12:00:00Z',
      motivo: 'Pedido cancelado',
      lineas: [
        { identificadorDetalle: '10', codigoArticulo: 'ESM-PE-24', descripcion: 'Articulo X', cantidad: 1, codigoAlmacen: 'BSPS03' },
        { identificadorDetalle: '11', codigoArticulo: 'ESM-PE-25', descripcion: 'Articulo Y', cantidad: 1, codigoAlmacen: 'BSPS02' },
        { identificadorDetalle: '12', codigoArticulo: 'ESM-PE-26', descripcion: 'Articulo Z', cantidad: 1, codigoAlmacen: 'TSPS01' },
      ],
      fueDespachado: true,
    });

    expect(devolucion?.lineas.map((linea) => linea.codigoAlmacen)).toEqual(['BSPS03', 'BSPS02', 'TSPS01']);
  });

  it('calcula devolución parcial cuando solo algunas líneas fueron recibidas', () => {
    expect(calcularEstadoDevolucion(2, 4)).toBe('DEVOLUCIÓN PARCIAL');
    expect(calcularEstadoDevolucion(4, 4)).toBe('DEVUELTO');
    expect(calcularEstadoDevolucion(0, 4)).toBe('PENDIENTE DE DEVOLUCIÓN');
  });

  it('rechaza la confirmación para usuarios sin permisos de almacén o consulta', () => {
    expect(puedeConfirmarLinea({ codigoRol: 'CONSULTA' }, 'BSPS03', 'BSPS03')).toBe(false);
    expect(puedeConfirmarLinea({ codigoRol: 'OPERADOR_BODEGA' }, 'BSPS03', 'BSPS02')).toBe(false);
    expect(puedeConfirmarLinea({ codigoRol: 'OPERADOR_BODEGA' }, 'BSPS03', 'BSPS03')).toBe(true);
    expect(puedeConfirmarLinea({ codigoRol: 'ADMINISTRADOR' }, 'BSPS03', 'BSPS02')).toBe(true);
  });
});
