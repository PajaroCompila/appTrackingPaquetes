import { beforeEach, describe, expect, it, vi } from 'vitest';
import type sql from 'mssql';

vi.mock('../../infraestructura/sql/consultaSap.js', () => ({
  consultarSap: vi.fn(),
}));

import { consultarSap } from '../../infraestructura/sql/consultaSap.js';
import { HistorialRepositorio } from './historialRepositorio.js';

const consultaSap = vi.mocked(consultarSap);

describe('deteccion de facturas SAP para entregados', () => {
  beforeEach(() => vi.clearAllMocks());

  it('prioriza el numero SAP conciliado al construir los candidatos', async () => {
    const query = vi.fn().mockResolvedValue({ recordset: [{
      idOrigen: 'R1:TSPS01:F1', folioPedido: 'F1', numeroPedido: '101478900',
    }] });
    const poolLocal = { request: () => ({ query }) } as unknown as sql.ConnectionPool;
    const repositorio = new HistorialRepositorio(undefined, () => poolLocal);

    await expect(repositorio.obtenerDespachadosPendientes()).resolves.toEqual([{
      idOrigen: 'R1:TSPS01:F1', folioPedido: 'F1', numeroPedido: '101478900',
    }]);
    const consulta = String(query.mock.calls[0]?.[0]);
    expect(consulta).toContain('ReferenciaPedidoSapR1');
    expect(consulta).toContain('referencia.numeroPedidoSap');
    expect(consulta).toContain('COALESCE');
  });

  it('consulta facturas directas y via entrega con uniones indexables', async () => {
    consultaSap.mockResolvedValue({
      recordset: [{ numeroPedido: 101478900 }],
    } as never);
    const repositorio = new HistorialRepositorio();

    await expect(repositorio.obtenerFacturadosSapPorNumero([
      { idOrigen: 'R1:TSPS01:F1', folioPedido: 'F1', numeroPedido: '101478900' },
      { idOrigen: 'R1:TSPS01:F2', folioPedido: 'F2', numeroPedido: '101478901' },
    ])).resolves.toEqual(new Set(['R1:TSPS01:F1']));

    const consulta = String(consultaSap.mock.calls[0]?.[0]);
    expect(consulta).toContain('lineaFactura.[BaseType] = 17');
    expect(consulta).toContain('lineaFactura.[BaseType] = 15');
    expect(consulta).toContain('UNION');
    expect(consulta).not.toContain('OR EXISTS');
  });

  it('detecta por folio una factura aunque aun no exista referencia local y persiste la relacion SAP', async () => {
    consultaSap.mockResolvedValue({ recordset: [{
      sapDocEntry: 970168, numeroPedido: 101478940, folioPedido: 'SPSS24PE387646',
      cantidadPedidosFolio: 1,
    }] } as never);
    const guardar = vi.fn().mockResolvedValue([]);
    const repositorio = new HistorialRepositorio(undefined, undefined, undefined, undefined,
      { guardar } as never);

    await expect(repositorio.obtenerFacturadosSapPorNumero([{
      idOrigen: 'R1:TSPS01:SPSS24PE387646', folioPedido: 'SPSS24PE387646',
      numeroPedido: 'SPSS24PE387646',
    }])).resolves.toEqual(new Set(['R1:TSPS01:SPSS24PE387646']));

    expect(String(consultaSap.mock.calls[0]?.[0])).toContain('U_SO1_01FOLIORETAIL1');
    expect(guardar).toHaveBeenCalledWith([{
      idOrigen: 'R1:TSPS01:SPSS24PE387646', codigoSucursal: 'TSPS01',
      folioPedido: 'SPSS24PE387646', sapDocEntry: 970168, numeroPedidoSap: '101478940',
    }]);
  });

  it('no asigna por folio cuando SAP devuelve una correspondencia ambigua', async () => {
    consultaSap.mockResolvedValue({ recordset: [{
      sapDocEntry: 970168, numeroPedido: 101478940, folioPedido: 'F1', cantidadPedidosFolio: 2,
    }] } as never);
    const guardar = vi.fn().mockResolvedValue([]);
    const repositorio = new HistorialRepositorio(undefined, undefined, undefined, undefined,
      { guardar } as never);

    await expect(repositorio.obtenerFacturadosSapPorNumero([{
      idOrigen: 'R1:TSPS01:F1', folioPedido: 'F1', numeroPedido: 'F1',
    }])).resolves.toEqual(new Set());
    expect(guardar).not.toHaveBeenCalled();
  });
});
