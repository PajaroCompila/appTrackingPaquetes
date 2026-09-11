import { beforeEach, describe, expect, it, vi } from 'vitest';

const dependencias = vi.hoisted(() => ({
  consultarR1: vi.fn(),
  obtenerPoolR1: vi.fn(),
}));

vi.mock('../../infraestructura/sql/consultaSistemaOrigen.js', () => ({
  consultarSistemaOrigen: dependencias.consultarR1,
}));
vi.mock('../../infraestructura/sql/consultaSap.js', () => ({
  consultarSap: vi.fn().mockResolvedValue({ recordset: [] }),
}));
vi.mock('../../infraestructura/sql/conexionSucursalesR1.js', () => ({
  obtenerSucursalesR1: () => [{ codigoTienda: 'TSPS01' }],
  obtenerPoolSucursalR1: dependencias.obtenerPoolR1,
}));

import { LineaDespachoOrigenRepositorio } from './lineaDespachoOrigenRepositorio.js';

describe('LineaDespachoOrigenRepositorio', () => {
  beforeEach(() => {
    dependencias.consultarR1.mockReset();
    dependencias.obtenerPoolR1.mockReset().mockResolvedValue({});
  });

  it('revalida una partida temporal R1 aunque todavía no tenga número SAP', async () => {
    dependencias.consultarR1.mockResolvedValue({
      recordset: [{
        idPedido: 'SPSS27PE387960',
        numeroPedido: 'SPSS27PE387960',
        identificadorDetalle: 2,
        folioPedido: 'SPSS27PE387960',
        nombreVendedor: 'Vendedor',
        fechaHoraPedido: '2026-09-11T09:30:00',
        codigoArticulo: 'ESM-PE-8',
        descripcion: 'Pergamino',
        cantidad: 2,
        codigoAlmacen: 'BSPS01',
        nombreAlmacen: 'Bodega Principal SPS',
      }],
    });

    const resultado = await new LineaDespachoOrigenRepositorio().obtenerLineas([{
      idOrigen: 'R1:TSPS01:SPSS27PE387960',
      identificadorDetalle: '2',
    }]);

    const consulta = String(dependencias.consultarR1.mock.calls[0]?.[0]);
    expect(consulta).toContain('COALESCE(');
    expect(consulta).not.toMatch(/U_SO1_DOCUMENTOSBO[^\n]+IS NOT NULL/);
    expect(resultado).toEqual([expect.objectContaining({
      idOrigen: 'R1:TSPS01:SPSS27PE387960',
      identificadorDetalle: '2',
      pedido: expect.objectContaining({ numeroPedido: 'SPSS27PE387960' }),
      articulo: expect.objectContaining({ codigoArticulo: 'ESM-PE-8', codigoAlmacen: 'BSPS01' }),
    })]);
  });
});
