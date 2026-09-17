import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ImpresionRepositorio } from './impresionRepositorio.js';
import { MIGRACION_AUDITORIA_IMPRESIONES } from './impresionMigracion.js';

const { input, query, request } = vi.hoisted(() => {
  const input = vi.fn();
  const query = vi.fn();
  const solicitud = { input, query };
  input.mockReturnValue(solicitud);
  return { input, query, request: vi.fn(() => solicitud) };
});
vi.mock('../../infraestructura/sql/conexionPedidosBodega.js', () => ({
  obtenerPoolPedidosBodega: () => ({ request }),
}));

describe('ImpresionRepositorio y migración local', () => {
  const repositorio = new ImpresionRepositorio();
  beforeEach(() => {
    input.mockClear(); request.mockClear();
    query.mockReset().mockResolvedValue({ recordset: [] });
  });

  it('no consulta ni registra lotes vacíos', async () => {
    expect(await repositorio.consultar([])).toEqual([]);
    expect(await repositorio.registrar([], 'usuario')).toEqual([]);
    expect(request).not.toHaveBeenCalled();
  });

  it('normaliza y deduplica solo por pedido/línea, no por código de artículo', async () => {
    await repositorio.registrar([
      { idOrigen: ' R1:F1 ', identificadorDetalle: ' 2 ', codigoArticulo: 'MISMO' },
      { idOrigen: 'R1:F1', identificadorDetalle: '1', codigoArticulo: 'MISMO' },
      { idOrigen: 'R1:F1', identificadorDetalle: '2', codigoArticulo: 'MISMO' },
    ], '11111111-1111-4111-8111-111111111111');
    const json = input.mock.calls.find(([nombre]) => nombre === 'lineasJson')?.[2];
    expect(JSON.parse(json)).toEqual([
      { idOrigen: 'R1:F1', identificadorDetalle: '1', codigoArticulo: 'MISMO' },
      { idOrigen: 'R1:F1', identificadorDetalle: '2', codigoArticulo: 'MISMO' },
    ]);
    expect(input.mock.calls.find(([nombre]) => nombre === 'usuarioId')?.[2]).toBe('11111111-1111-4111-8111-111111111111');
  });

  it('reimpresiones insertan auditoría; contador y evento se guardan en una transacción bloqueada', async () => {
    const linea = { idOrigen: 'SAP:123', identificadorDetalle: '0', codigoArticulo: 'ART-1' };
    await repositorio.registrar([linea], 'A');
    await repositorio.registrar([linea], 'B');
    expect(query).toHaveBeenCalledTimes(2);
    for (const [consulta] of query.mock.calls) {
      expect(consulta).toContain("IF DB_NAME() <> N'PedidosBodega'");
      expect(consulta).toContain('SET XACT_ABORT ON');
      expect(consulta).toContain('BEGIN TRANSACTION');
      expect(consulta).toContain('UPDLOCK, HOLDLOCK');
      expect(consulta).toContain('sys.sp_getapplock');
      expect(consulta).toContain("@LockOwner = N'Transaction'");
      expect(consulta.indexOf('sys.sp_getapplock')).toBeLessThan(consulta.indexOf('UPDATE impresion'));
      expect(consulta).toContain('cantidadImpresiones = impresion.cantidadImpresiones + 1');
      expect(consulta).toContain('INSERT dbo.RegistroImpresionArticulo');
      expect(consulta).not.toMatch(/(?:UPDATE|DELETE)\s+(?:dbo\.)?RegistroImpresionArticulo/i);
      expect(consulta).toContain('SYSUTCDATETIME()');
      expect(consulta).toContain('ROLLBACK TRANSACTION');
      expect(consulta).not.toMatch(/SAP|SO1_01VENTA|R1\./);
    }
  });

  it('consultar es SELECT local y devuelve fecha, contador y nombre persistente', async () => {
    const estado = { idOrigen: 'R1:F1', identificadorDetalle: '1', cantidadImpresiones: 2,
      ultimaImpresionEn: new Date(), ultimaImpresionPor: 'Jorge Lara' };
    query.mockResolvedValue({ recordset: [estado] });
    expect(await repositorio.consultar([{ idOrigen: 'R1:F1', identificadorDetalle: '1' }])).toEqual([estado]);
    expect(query.mock.calls[0]?.[0]).toContain('usuario.nombreVisible AS ultimaImpresionPor');
    expect(query.mock.calls[0]?.[0]).not.toMatch(/(?:UPDATE|DELETE)\s+dbo\./i);
  });

  it('migración es idempotente y no altera ni inventa registros previos', () => {
    expect(MIGRACION_AUDITORIA_IMPRESIONES).toContain("IF DB_NAME() <> N'PedidosBodega'");
    expect(MIGRACION_AUDITORIA_IMPRESIONES).toContain("IF OBJECT_ID(N'dbo.RegistroImpresionArticulo', N'U') IS NULL");
    expect(MIGRACION_AUDITORIA_IMPRESIONES).toContain('FOREIGN KEY(idOrigen, identificadorDetalle)');
    expect(MIGRACION_AUDITORIA_IMPRESIONES).toContain('FOREIGN KEY(usuarioId)');
    expect(MIGRACION_AUDITORIA_IMPRESIONES).not.toMatch(/(?:INSERT|UPDATE|DELETE)\s+dbo\.ImpresionArticulo/i);
  });
});
