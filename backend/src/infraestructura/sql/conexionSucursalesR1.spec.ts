import type sql from 'mssql';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ConfiguracionSucursalR1 } from '../../configuracion/configuracionBaseDatos.js';

const mocks = vi.hoisted(() => ({ crearPoolSql: vi.fn() }));
vi.mock('./crearPoolSql.js', () => ({ crearPoolSql: mocks.crearPoolSql }));

import {
  cerrarConexionesSucursalesR1,
  obtenerPoolSucursalR1,
} from './conexionSucursalesR1.js';

const configuracion: ConfiguracionSucursalR1 = {
  codigoTienda: 'TSPS01', nombreTienda: 'SPS', servidor: '127.0.0.1', puerto: 1433,
  baseDatos: 'Retail One', usuario: 'lectura', contrasena: 'prueba', cifrar: false,
  confiarCertificado: false, tiempoEsperaConexionMs: 5_000, tiempoMaximoConsultaMs: 30_000,
  poolMinimo: 0, poolMaximo: 2,
};

describe('conexiones R1 por sucursal', () => {
  afterEach(async () => {
    await cerrarConexionesSucursalesR1();
    vi.clearAllMocks();
  });

  it('reutiliza una sola conexion cuando dos consultas llegan al mismo tiempo', async () => {
    let completarConexion!: () => void;
    const connect = vi.fn().mockReturnValue(new Promise<void>((resolver) => {
      completarConexion = resolver;
    }));
    const pool = ({
      connected: false, connect, close: vi.fn().mockResolvedValue(undefined),
    } as unknown as sql.ConnectionPool);
    mocks.crearPoolSql.mockReturnValue(pool);

    const primera = obtenerPoolSucursalR1(configuracion);
    const segunda = obtenerPoolSucursalR1(configuracion);
    await vi.waitFor(() => expect(connect).toHaveBeenCalledOnce());
    completarConexion();

    await expect(Promise.all([primera, segunda])).resolves.toEqual([pool, pool]);
    expect(mocks.crearPoolSql).toHaveBeenCalledOnce();
  });
});
