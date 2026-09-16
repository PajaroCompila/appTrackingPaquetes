import { describe, expect, it, vi } from 'vitest';

const pool = vi.hoisted(() => ({ connected: false, connect: vi.fn(), close: vi.fn() }));
const crearPool = vi.hoisted(() => vi.fn());
vi.mock('./crearPoolSql.js', () => ({ crearPoolSql: crearPool }));
vi.mock('../../configuracion/configuracionBaseDatos.js', () => ({ obtenerConfiguracionSap: vi.fn().mockReturnValue({}) }));

describe('Conexión SAP compartida por las fuentes de historial', () => {
  it('tres consultas simultáneas usan un único intento y un único pool', async () => {
    vi.resetModules(); pool.connected=false; crearPool.mockReset().mockReturnValue(pool);
    pool.connect.mockReset().mockImplementation(async () => { await Promise.resolve(); pool.connected=true; });
    pool.close.mockReset().mockImplementation(async () => { pool.connected=false; });
    const conexion = await import('./conexionSap.js');
    const resultados = await Promise.all([conexion.obtenerPoolSap(),conexion.obtenerPoolSap(),conexion.obtenerPoolSap()]);
    expect(crearPool).toHaveBeenCalledTimes(1); expect(pool.connect).toHaveBeenCalledTimes(1);
    resultados.forEach(p => expect(p).toBe(pool));
    await conexion.cerrarConexionSap(); expect(pool.close).toHaveBeenCalledTimes(1);
  });
  it('un fallo compartido respeta el enfriamiento sin abrir pools adicionales', async () => {
    vi.resetModules(); pool.connected=false; crearPool.mockReset().mockReturnValue(pool);
    pool.connect.mockReset().mockRejectedValue(new Error('desconectado')); pool.close.mockReset().mockResolvedValue(undefined);
    const conexion = await import('./conexionSap.js');
    const resultados = await Promise.allSettled([conexion.obtenerPoolSap(),conexion.obtenerPoolSap()]);
    expect(resultados.every(r => r.status === 'rejected')).toBe(true); expect(crearPool).toHaveBeenCalledTimes(1);
    await expect(conexion.obtenerPoolSap()).rejects.toThrow('temporalmente'); expect(crearPool).toHaveBeenCalledTimes(1);
    await conexion.cerrarConexionSap();
  });
});
