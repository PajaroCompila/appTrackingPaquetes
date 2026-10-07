import { describe, expect, it, vi } from 'vitest';
import type sql from 'mssql';
import { HistorialRepositorio } from './historialRepositorio.js';

describe('fuentes locales del Historial', () => {
  it('obtiene el receptor real persistido de la devolución', async () => {
    const query = vi.fn().mockResolvedValue({ recordset: [{ recibidoPor: '  Marcos Pérez  ' }] });
    const request = { input: vi.fn().mockReturnThis(), query };
    const pool = { request: () => request } as unknown as sql.ConnectionPool;
    const repositorio = new HistorialRepositorio(() => pool, () => pool, []);

    await expect(repositorio.obtenerReceptorDevolucion('R1:BSPS02:F1'))
      .resolves.toBe('Marcos Pérez');
    expect(request.input).toHaveBeenCalledWith('idOrigen', expect.anything(), 'R1:BSPS02:F1');
    expect(String(query.mock.calls[0]?.[0])).toContain('dbo.RecepcionDevolucionPedido');
    expect(String(query.mock.calls[0]?.[0])).toContain('dbo.DevolucionPedidoDetalle');
  });

  it('incluye despachos cerrados y anulaciones persistidas como CERRADO', async () => {
    const query = vi.fn().mockResolvedValue({ recordset: [] });
    const request = { input: vi.fn().mockReturnThis(), query };
    const pool = { request: () => request } as unknown as sql.ConnectionPool;
    const repositorio = new HistorialRepositorio(() => pool, () => pool, []);

    await repositorio.buscarHistorial({ fechaDesde: '2026-10-06', fechaHasta: '2026-10-06',
      codigosAlmacen: [], pagina: 1, cantidadPorPagina: 25 });
    await repositorio.buscarArticulosHistorial({ fechaDesde: '2026-10-06', fechaHasta: '2026-10-06',
      codigosAlmacen: [], pagina: 1, cantidadPorPagina: 25 });

    const consultas = query.mock.calls.map(([consulta]) => String(consulta));
    expect(consultas).toHaveLength(2);
    for (const consulta of consultas) {
      expect(consulta).toContain("pedido.estadoLocal = 'CERRADO'");
      expect(consulta).toContain('dbo.CancelacionSapHistorial');
      expect(consulta).toContain("cancelado.activo=1");
      expect(consulta).toContain("CONVERT(varchar(12), 'CERRADO')");
    }
  });
});
