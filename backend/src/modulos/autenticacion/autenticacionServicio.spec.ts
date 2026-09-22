import argon2 from 'argon2';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IdentidadAutenticada, UsuarioAutenticacion } from './autenticacion.interface.js';
import type { IAutenticacionRepositorio } from './autenticacionRepositorio.js';
import { AutenticacionServicio, opcionesArgon2 } from './autenticacionServicio.js';

describe('AutenticacionServicio', () => {
  let hashValido: Buffer;
  let repositorio: IAutenticacionRepositorio;
  let usuario: UsuarioAutenticacion;

  beforeAll(async () => {
    hashValido = Buffer.from(await argon2.hash('contrasena-correcta', opcionesArgon2), 'utf8');
  });

  beforeEach(() => {
    usuario = {
      usuarioId: '11111111-1111-1111-1111-111111111111',
      nombreUsuario: 'operador', nombreVisible: 'Operador', hashContrasena: hashValido,
      algoritmoContrasena: 'argon2id', codigoRol: 'OPERADOR_BODEGA', codigoAlmacen: 'BSPS01',
      codigosAlmacenVisibles: ['BSPS01'], activo: true, debeCambiarContrasena: false,
      intentosFallidos: 0, bloqueadoHasta: null,
    };
    repositorio = {
      buscarUsuario: vi.fn().mockResolvedValue(usuario),
      crearSesion: vi.fn().mockResolvedValue(undefined),
      obtenerIdentidadSesion: vi.fn().mockImplementation(async (sesionId: string) => ({
        usuarioId: usuario.usuarioId, nombreUsuario: usuario.nombreUsuario,
        nombreVisible: usuario.nombreVisible, codigoRol: usuario.codigoRol,
        codigoAlmacen: usuario.codigoAlmacen, codigosAlmacenVisibles: usuario.codigosAlmacenVisibles,
        sesionId, debeCambiarContrasena: usuario.debeCambiarContrasena,
      } satisfies IdentidadAutenticada)),
      revocarSesion: vi.fn().mockResolvedValue(undefined),
      registrarIntentoFallido: vi.fn().mockResolvedValue(undefined),
      registrarAccesoCorrecto: vi.fn().mockResolvedValue(undefined),
      cambiarContrasena: vi.fn().mockResolvedValue(undefined),
      revocarSesionesUsuario: vi.fn().mockResolvedValue(undefined),
    };
  });

  it('valida Argon2id, crea la sesión y permite verificar el token', async () => {
    const servicio = new AutenticacionServicio(repositorio);

    const sesion = await servicio.iniciarSesion('operador', 'contrasena-correcta');
    const identidad = await servicio.validarToken(sesion.token);

    expect(repositorio.registrarAccesoCorrecto).toHaveBeenCalledWith(usuario.usuarioId);
    expect(repositorio.crearSesion).toHaveBeenCalledOnce();
    expect(identidad).toMatchObject({ usuarioId: usuario.usuarioId, nombreUsuario: 'operador' });
  });

  it('rechaza una contraseña incorrecta y registra el intento', async () => {
    const servicio = new AutenticacionServicio(repositorio);

    await expect(servicio.iniciarSesion('operador', 'incorrecta'))
      .rejects.toMatchObject({ estadoHttp: 401, codigo: 'CREDENCIALES_INVALIDAS' });
    expect(repositorio.registrarIntentoFallido).toHaveBeenCalledWith(usuario.usuarioId);
    expect(repositorio.crearSesion).not.toHaveBeenCalled();
  });

  it('rechaza un usuario inexistente sin registrar un intento sobre otra cuenta', async () => {
    vi.mocked(repositorio.buscarUsuario).mockResolvedValue(null);
    const servicio = new AutenticacionServicio(repositorio);

    await expect(servicio.iniciarSesion('inexistente', 'incorrecta'))
      .rejects.toMatchObject({ estadoHttp: 401, codigo: 'CREDENCIALES_INVALIDAS' });
    expect(repositorio.registrarIntentoFallido).not.toHaveBeenCalled();
  });

  it('distingue un usuario bloqueado sin comprobar ni modificar su contraseña', async () => {
    usuario.bloqueadoHasta = new Date(Date.now() + 60_000);
    const servicio = new AutenticacionServicio(repositorio);

    await expect(servicio.iniciarSesion('operador', 'contrasena-correcta'))
      .rejects.toMatchObject({ estadoHttp: 429, codigo: 'USUARIO_BLOQUEADO' });
    expect(repositorio.registrarIntentoFallido).not.toHaveBeenCalled();
    expect(repositorio.crearSesion).not.toHaveBeenCalled();
  });

  it('revoca la sesión al cerrar sesión', async () => {
    const servicio = new AutenticacionServicio(repositorio);

    await servicio.cerrarSesion('22222222-2222-2222-2222-222222222222');

    expect(repositorio.revocarSesion).toHaveBeenCalledWith('22222222-2222-2222-2222-222222222222');
  });
});
