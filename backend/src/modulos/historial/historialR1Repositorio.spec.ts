import { describe, expect, it, vi } from 'vitest';
import type { ConfiguracionSucursalR1 } from '../../configuracion/configuracionBaseDatos.js';
import { HistorialR1Repositorio, seleccionarSucursalesHistorial } from './historialR1Repositorio.js';

const sucursal = (codigoTienda: string): ConfiguracionSucursalR1 => ({
  codigoTienda,
  nombreTienda: codigoTienda,
  servidor: '127.0.0.1',
  puerto: 1433,
  baseDatos: 'Retail One',
  usuario: 'lectura',
  contrasena: 'prueba',
  cifrar: false,
  confiarCertificado: false,
  tiempoEsperaConexionMs: 5_000,
  tiempoMaximoConsultaMs: 30_000,
  poolMinimo: 0,
  poolMaximo: 2,
});

const sucursales = ['TLCB01', 'TPRO01', 'TCIR01', 'TSPS01', 'TTGU01', 'TTBM01']
  .map(sucursal);

describe('seleccionarSucursalesHistorial', () => {
  it('consulta solo SPS cuando todas las bodegas seleccionadas pertenecen a SPS', () => {
    expect(seleccionarSucursalesHistorial(sucursales, ['BSPS03', 'BSPS04', 'TSPS01'])
      .map(({ codigoTienda }) => codigoTienda)).toEqual(['TSPS01']);
  });

  it('conserva las sucursales distintas requeridas por el filtro', () => {
    expect(seleccionarSucursalesHistorial(sucursales, ['BCIR01', 'BTGU02'])
      .map(({ codigoTienda }) => codigoTienda)).toEqual(['TCIR01', 'TTGU01']);
  });

  it('consulta todas las sucursales sin filtro o ante un codigo no identificable', () => {
    expect(seleccionarSucursalesHistorial(sucursales, [])).toEqual(sucursales);
    expect(seleccionarSucursalesHistorial(sucursales, ['BODEGA-EXTERNA'])).toEqual(sucursales);
    expect(seleccionarSucursalesHistorial(sucursales, ['BSPS03', 'BXYZ01'])).toEqual(sucursales);
  });

  it('rechaza la respuesta completa si una sucursal falla en lugar de devolver datos parciales', async () => {
    const repositorio = new HistorialR1Repositorio(sucursales.slice(0, 2));
    const interno = repositorio as unknown as {
      consultarCabeceras: (...argumentos: unknown[]) => Promise<unknown[]>;
    };
    vi.spyOn(interno, 'consultarCabeceras')
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error('timeout'));

    await expect(repositorio.buscar({ fechaDesde: '2026-10-07', fechaHasta: '2026-10-07',
      codigosAlmacen: [], pagina: 1, cantidadPorPagina: 25 }))
      .rejects.toThrow('No fue posible confirmar el historial R1');
  });
});
