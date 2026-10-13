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

  it('no presenta como Facturado un cierre SAP sin factura y excluye su copia si ya existe el despacho R1', async () => {
    const base = {
      idOrigen: 'SAP:969247', origenPedido: 'SAP', creadoEnR1: false,
      sapDocEntry: '969247', folioPedido: 'SAP:969247', numeroPedido: '101478559',
      nombreVendedor: 'SPS Venta de Tienda', fechaHoraPedido: new Date('2026-10-13T09:50:00Z'),
      fechaEntradaCola: null, esEspecial: false, estadoLocalOrigen: 'VALIDADO',
      despachadoEn: null, validadoDetectadoEn: new Date('2026-10-13T15:55:23Z'),
      usuarioDespacho: null, total: 1,
      identificadorDetalle: '0', numeroLinea: 0, codigoArticulo: 'AD-5270',
      descripcion: 'CONVERTIDOR HDMI MACHO A VGA HEMBRA', cantidad: 1,
    };
    const query = vi.fn()
      .mockResolvedValueOnce({ recordset: [{ ...base, idPedidoDespachado: null,
        idPedidoSapHistorial: 11556, snapshotCierre: null,
        detalleCodigoAlmacen: 'BSPS03', detalleNombreAlmacen: 'Circuitos y Repuestos',
        transferidoEn: null, usuarioLinea: null }] })
      .mockResolvedValueOnce({ recordset: [{ ...base, codigoAlmacen: 'BSPS03',
        nombreAlmacen: 'Circuitos y Repuestos', esSnapshotCierre: true }] });
    const request = { input: vi.fn().mockReturnThis(), query };
    const pool = { request: () => request } as unknown as sql.ConnectionPool;
    const repositorio = new HistorialRepositorio(() => pool, () => pool, []);
    const filtros = { fechaDesde: '2026-10-13', fechaHasta: '2026-10-13',
      codigosAlmacen: [], pagina: 1, cantidadPorPagina: 25 };

    await expect(repositorio.buscarHistorial(filtros)).resolves.toMatchObject({
      registros: [{ numeroPedido: '101478559', estadoHistorial: 'CERRADO' }],
    });
    await expect(repositorio.buscarArticulosHistorial(filtros)).resolves.toMatchObject({
      registros: [{ numeroPedido: '101478559', estadoHistorial: 'CERRADO' }],
    });
    for (const [consulta] of query.mock.calls) {
      expect(String(consulta)).toContain('FROM dbo.PedidoDespachado local');
      expect(String(consulta)).toContain('local.numeroPedido=pedido.numeroPedido');
      expect(String(consulta)).toContain('referenciaLocal.sapDocEntry=pedido.sapDocEntry');
    }
  });
});
