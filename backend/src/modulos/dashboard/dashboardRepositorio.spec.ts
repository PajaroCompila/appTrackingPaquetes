import { describe, expect, it, vi } from 'vitest';
import type { ConfiguracionSucursalR1 } from '../../configuracion/configuracionBaseDatos.js';
import { DashboardRepositorio } from './dashboardRepositorio.js';

function sucursal(codigoTienda: string): ConfiguracionSucursalR1 {
  return { codigoTienda, nombreTienda: codigoTienda, servidor: '192.168.10.150', puerto: 1433,
    baseDatos: 'Retail One', usuario: 'usuario', contrasena: 'secreto', cifrar: false,
    confiarCertificado: false, tiempoEsperaConexionMs: 5000, tiempoMaximoConsultaMs: 10000,
    poolMinimo: 0, poolMaximo: 2 };
}

describe('DashboardRepositorio', () => {
  it('consulta cada servidor y conserva disponible una sucursal aunque otra falle', async () => {
    const consultar = vi.fn()
      .mockResolvedValueOnce({ pendientes: 3, validados: 24 })
      .mockRejectedValueOnce(new Error('Servidor no disponible'));
    const resultado = await new DashboardRepositorio(
      [sucursal('TLCB01'), sucursal('TPRO01')], consultar,
    ).obtenerResumen({ fechaDesde: '2026-08-06', fechaHasta: '2026-08-06' });
    expect(resultado).toEqual([
      { codigoTienda: 'TLCB01', nombreTienda: 'TLCB01', pendientes: 3, validados: 24, disponible: true },
      { codigoTienda: 'TPRO01', nombreTienda: 'TPRO01', pendientes: 0, validados: 0, disponible: false },
    ]);
  });

  it('consulta únicamente la sucursal seleccionada', async () => {
    const consultar = vi.fn().mockResolvedValue({ pendientes: 1, validados: 2 });
    await new DashboardRepositorio([sucursal('TLCB01'), sucursal('TCIR01')], consultar)
      .obtenerResumen({ fechaDesde: '2026-08-06', fechaHasta: '2026-08-06', codigoTienda: 'TCIR01' });
    expect(consultar).toHaveBeenCalledTimes(1);
    expect(consultar.mock.calls[0]?.[0].codigoTienda).toBe('TCIR01');
  });
});
