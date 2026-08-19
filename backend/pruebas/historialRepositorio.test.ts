import type sql from 'mssql';
import { describe, expect, it, vi } from 'vitest';
import { HistorialRepositorio } from '../src/modulos/historial/historialRepositorio.js';

describe('HistorialRepositorio', () => {
  it('consulta R1 en un lote SELECT parametrizado y únicamente para folios locales', async () => {
    const parametros = new Map<string, unknown>();
    let consulta = '';
    const solicitud = {
      input: vi.fn((nombre: string, _tipo: unknown, valor: unknown) => {
        parametros.set(nombre, valor);
        return solicitud;
      }),
      query: vi.fn(async (texto: string) => {
        consulta = texto;
        return { recordset: [] };
      }),
    };
    const pool = { request: () => solicitud } as unknown as sql.ConnectionPool;
    const configuracion = { codigoTienda: 'TSPS01', nombreTienda: 'SPS', servidor: '192.168.10.150',
      puerto: 1433, baseDatos: 'Retail One', usuario: 'u', contrasena: 'c', cifrar: false,
      confiarCertificado: false, tiempoEsperaConexionMs: 5000, tiempoMaximoConsultaMs: 10000,
      poolMinimo: 0, poolMaximo: 1 };
    const repositorio = new HistorialRepositorio(() => pool, () => pool, [configuracion], async () => pool);

    await repositorio.obtenerEstadosR1([
      { idOrigen: 'R1:F1', folioPedido: 'F1' },
      { idOrigen: 'R1:F2', folioPedido: 'F2' },
      { idOrigen: 'R1:F1', folioPedido: 'F1' },
    ]);

    expect(parametros.get('folio0')).toBe('F1');
    expect(parametros.get('folio1')).toBe('F2');
    expect(consulta.trimStart()).toMatch(/^SELECT/i);
    expect(consulta).toContain("venta.[U_SO1_VERIFICADO] = 'Y'");
    expect(consulta).toContain("venta.[U_SO1_STATUS] = 'C'");
    expect(consulta).toContain('venta.[U_SO1_SUCURSAL]');
    expect(consulta).toContain('venta.[Name] IN (@folio0, @folio1)');
    expect(consulta).not.toMatch(/\b(INSERT|UPDATE|DELETE|MERGE|SELECT\s+INTO|CREATE|ALTER|DROP|TRUNCATE|EXEC(?:UTE)?)\b/i);
  });
});
