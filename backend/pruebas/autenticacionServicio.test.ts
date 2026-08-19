import argon2 from 'argon2';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AutenticacionServicio } from '../src/modulos/autenticacion/autenticacionServicio.js';
import type { IAutenticacionRepositorio } from '../src/modulos/autenticacion/autenticacionRepositorio.js';

const usuarioBase = {
  usuarioId: '11111111-1111-4111-8111-111111111111', nombreUsuario: 'operador',
  nombreVisible: 'Operador de prueba', algoritmoContrasena: 'argon2id', codigoRol: null,
  codigoAlmacen: null, activo: true, hashContrasena: Buffer.alloc(0),
  debeCambiarContrasena: false, intentosFallidos: 0, bloqueadoHasta: null,
};
let hash: Buffer;

beforeAll(async () => {
  process.env.AUTENTICACION_JWT_SECRETO = 'secreto-de-prueba-con-mas-de-32-caracteres';
  hash = Buffer.from(await argon2.hash('ClaveSeguraTemporal1', { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 }));
});

describe('AutenticacionServicio', () => {
  let repositorio: IAutenticacionRepositorio;
  beforeEach(() => {
    repositorio = {
      buscarUsuario: vi.fn().mockResolvedValue({ ...usuarioBase, hashContrasena: hash }),
      crearSesion: vi.fn().mockResolvedValue(undefined),
      obtenerIdentidadSesion: vi.fn(), revocarSesion: vi.fn().mockResolvedValue(undefined),
      registrarIntentoFallido: vi.fn().mockResolvedValue(undefined),
      registrarAccesoCorrecto: vi.fn().mockResolvedValue(undefined),
      cambiarContrasena: vi.fn().mockResolvedValue(undefined),
      revocarSesionesUsuario: vi.fn().mockResolvedValue(undefined),
    };
  });

  it('crea una sesiÃ³n para credenciales vÃ¡lidas sin exponer el hash', async () => {
    const resultado = await new AutenticacionServicio(repositorio).iniciarSesion('operador', 'ClaveSeguraTemporal1');
    expect(resultado.token).toBeTruthy();
    expect(resultado.identidad.nombreVisible).toBe('Operador de prueba');
    expect(repositorio.crearSesion).toHaveBeenCalledOnce();
    expect(resultado.identidad).not.toHaveProperty('hashContrasena');
  });

  it('rechaza de forma genÃ©rica una contraseÃ±a incorrecta', async () => {
    await expect(new AutenticacionServicio(repositorio).iniciarSesion('operador', 'Incorrecta123'))
      .rejects.toMatchObject({ codigo: 'CREDENCIALES_INVALIDAS', estadoHttp: 401 });
  });

  it('rechaza un usuario inactivo con la misma respuesta genÃ©rica', async () => {
    vi.mocked(repositorio.buscarUsuario).mockResolvedValue({ ...usuarioBase, hashContrasena: hash, activo: false });
    await expect(new AutenticacionServicio(repositorio).iniciarSesion('operador', 'ClaveSeguraTemporal1'))
      .rejects.toMatchObject({ codigo: 'CREDENCIALES_INVALIDAS', estadoHttp: 401 });
  });

  it('valida el token contra una sesiÃ³n persistida y revoca al cerrar', async () => {
    const servicio = new AutenticacionServicio(repositorio);
    const creada = await servicio.iniciarSesion('operador', 'ClaveSeguraTemporal1');
    vi.mocked(repositorio.obtenerIdentidadSesion).mockResolvedValue(creada.identidad);
    await expect(servicio.validarToken(creada.token)).resolves.toEqual(creada.identidad);
    await servicio.cerrarSesion(creada.identidad.sesionId);
    expect(repositorio.revocarSesion).toHaveBeenCalledWith(creada.identidad.sesionId);
  });
});
