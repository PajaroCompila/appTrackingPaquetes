import type sql from 'mssql';
import { describe, expect, it, vi } from 'vitest';
import { AlmacenRepositorio } from '../src/modulos/almacenes/almacenRepositorio.js';

describe('AlmacenRepositorio', () => {
  it('consulta el catálogo completo con nombres originales y sucursal comprobada', async () => {
    let consultaEjecutada = '';
    const parametros = new Map<string, unknown>();
    const filas = [
      { codigoAlmacen: 'B01', nombreAlmacen: 'Nombre original', codigoSucursal: 'S1', nombreSucursal: 'Sucursal 1' },
      { codigoAlmacen: 'B02', nombreAlmacen: 'Nombre original', codigoSucursal: 'S2', nombreSucursal: 'Sucursal 2' },
    ];
    const solicitud = {
      input: vi.fn((nombre: string, _tipo: unknown, valor: unknown) => {
        parametros.set(nombre, valor);
        return solicitud;
      }),
      query: vi.fn(async (consulta: string) => {
        consultaEjecutada = consulta;
        return { recordset: filas };
      }),
    };
    const pool = { request: () => solicitud } as unknown as sql.ConnectionPool;

    const resultado = await new AlmacenRepositorio(() => pool).obtenerAlmacenes();

    expect(resultado).toEqual(filas);
    expect(resultado).toHaveLength(2);
    expect(parametros.get('cantidadMaxima')).toBe(5000);
    expect(parametros.get('patronTransito')).toBe('%Transito%');
    expect(parametros.get('codigoAlmacenExcluido')).toBe('BSPS06');
    expect(consultaEjecutada).toContain('[@SO1_01SUCURSALALMA]');
    expect(consultaEjecutada).toContain('[@SO1_01SUCURSAL]');
    expect(consultaEjecutada).toContain('[U_SO1_CODIGOALMACEN] AS codigoAlmacen');
    expect(consultaEjecutada).toContain('[U_SO1_NOMBREALMACEN] AS nombreAlmacen');
    expect(consultaEjecutada).toContain('[U_SO1_CODIGOPADRE]');
    expect(consultaEjecutada).toContain('[U_SO1_NOMBREALMACEN] NOT LIKE @patronTransito');
    expect(consultaEjecutada).toContain('[U_SO1_CODIGOALMACEN] <> @codigoAlmacenExcluido');
    expect(consultaEjecutada).toContain('ORDER BY almacenSucursal.[U_SO1_CODIGOALMACEN]');
    expect(consultaEjecutada).not.toContain('[OWHS]');
    expect(consultaEjecutada).not.toMatch(/WHERE[^;]*SPS/i);
    expect(consultaEjecutada).not.toMatch(/SELECT\s+\*/i);
  });
});
