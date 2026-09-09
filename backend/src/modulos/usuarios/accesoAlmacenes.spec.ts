import { describe, expect, it } from 'vitest';
import { puedeVerAlmacen, restringirCodigosAlmacen } from './accesoAlmacenes.js';

describe('acceso a bodegas por usuario', () => {
  const restringido = { codigoRol: 'OPERADOR_BODEGA', codigosAlmacenVisibles: ['TCIR01'] };

  it('aplica las bodegas configuradas cuando no se envía filtro', () => {
    expect(restringirCodigosAlmacen(restringido, [])).toEqual(['TCIR01']);
  });

  it('no convierte un filtro sin permiso en una consulta sin filtro', () => {
    expect(restringirCodigosAlmacen(restringido, ['BSPS01'])).toEqual(['SIN_ACCESO']);
  });

  it('mantiene acceso completo para administradores y usuarios sin configuración', () => {
    expect(restringirCodigosAlmacen({ codigoRol: 'ADMINISTRADOR', codigosAlmacenVisibles: ['TCIR01'] }, [])).toEqual([]);
    expect(puedeVerAlmacen({ codigoRol: 'CONSULTA', codigosAlmacenVisibles: [] }, 'BSPS01')).toBe(true);
  });

  it('valida cada bodega en detalles e inventario', () => {
    expect(puedeVerAlmacen(restringido, 'TCIR01')).toBe(true);
    expect(puedeVerAlmacen(restringido, 'BSPS01')).toBe(false);
  });
});
