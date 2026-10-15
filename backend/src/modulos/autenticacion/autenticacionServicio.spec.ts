import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { obtenerConfiguracionAutenticacion } from '../../configuracion/configuracion.js';
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
      renovarSesion: vi.fn().mockResolvedValue(true),
      obtenerIdentidadSesion: vi.fn().mockImplementation(async (sesionId: string) => ({
        usuarioId: usuario.usuarioId, nombreUsuario: usuario.nombreUsuario,
        nombreVisible: usuario.nombreVisible, codigoRol: usuario.codigoRol,
        codigoAlmacen: usuario.codigoAlmacen, codigosAlmacenVisibles: usuario.codigosAlmacenVisibles,
        sesionId, debeCambiarContrasena: usuario.debeCambiarContrasena,
      } satisfies IdentidadAutenticada)),
      revocarSesion: vi.fn().mockResolvedValue(undefined),
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

  it('renueva una sesion activa cuando esta cerca de expirar', async () => {
    const servicio = new AutenticacionServicio(repositorio);
    const sesion = await servicio.iniciarSesion('operador', 'contrasena-correcta');
    const contenido = jwt.decode(sesion.token) as jwt.JwtPayload;
    const tokenCercanoAVencer = jwt.sign({}, obtenerConfiguracionAutenticacion().secretoJwt, {
      algorithm: 'HS256', subject: sesion.identidad.usuarioId, jwtid: contenido.jti,
      expiresIn: 60, issuer: 'appPedidosBodega', audience: 'appPedidosBodega-web',
    });

    const renovacion = await servicio.renovarTokenSiCorresponde(tokenCercanoAVencer, sesion.identidad);

    expect(renovacion?.token).toBeTruthy();
    expect(repositorio.renovarSesion).toHaveBeenCalledWith(sesion.identidad.sesionId, expect.any(Date));
  });

  it('no escribe en base mientras la sesion conserva suficiente vigencia', async () => {
    const servicio = new AutenticacionServicio(repositorio);
    const sesion = await servicio.iniciarSesion('operador', 'contrasena-correcta');

    await expect(servicio.renovarTokenSiCorresponde(sesion.token, sesion.identidad)).resolves.toBeNull();
    expect(repositorio.renovarSesion).not.toHaveBeenCalled();
  });

  it('rechaza contraseñas incorrectas sin acumular intentos ni bloquear la cuenta', async () => {
    const servicio = new AutenticacionServicio(repositorio);

    for (let intento = 0; intento < 8; intento++) {
      await expect(servicio.iniciarSesion('operador', 'incorrecta'))
        .rejects.toMatchObject({ estadoHttp: 401, codigo: 'CREDENCIALES_INVALIDAS' });
    }
    expect(usuario.intentosFallidos).toBe(0);
    expect(usuario.bloqueadoHasta).toBeNull();
    expect(repositorio.crearSesion).not.toHaveBeenCalled();
    await expect(servicio.iniciarSesion('operador', 'contrasena-correcta')).resolves.toHaveProperty('token');
  });

  it('rechaza un usuario inexistente sin registrar un intento sobre otra cuenta', async () => {
    vi.mocked(repositorio.buscarUsuario).mockResolvedValue(null);
    const servicio = new AutenticacionServicio(repositorio);

    await expect(servicio.iniciarSesion('inexistente', 'incorrecta'))
      .rejects.toMatchObject({ estadoHttp: 401, codigo: 'CREDENCIALES_INVALIDAS' });
  });

  it('permite acceso correcto aunque exista un bloqueo antiguo en la base', async () => {
    usuario.bloqueadoHasta = new Date(Date.now() + 60_000);
    const servicio = new AutenticacionServicio(repositorio);

    await expect(servicio.iniciarSesion('operador', 'contrasena-correcta'))
      .resolves.toHaveProperty('token');
    expect(repositorio.crearSesion).toHaveBeenCalledOnce();
  });

  it('revoca la sesión al cerrar sesión', async () => {
    const servicio = new AutenticacionServicio(repositorio);

    await servicio.cerrarSesion('22222222-2222-2222-2222-222222222222');

    expect(repositorio.revocarSesion).toHaveBeenCalledWith('22222222-2222-2222-2222-222222222222');
  });

  it('impide iniciar sesión a una cuenta eliminada lógicamente', async () => {
    usuario.activo = false;
    const servicio = new AutenticacionServicio(repositorio);
    await expect(servicio.iniciarSesion('operador', 'contrasena-correcta'))
      .rejects.toMatchObject({ estadoHttp: 401, codigo: 'CREDENCIALES_INVALIDAS' });
    expect(repositorio.crearSesion).not.toHaveBeenCalled();
  });

  it('pierde autorización si la sesión deja de estar vigente después de eliminar la cuenta', async () => {
    const servicio = new AutenticacionServicio(repositorio);
    const sesion = await servicio.iniciarSesion('operador', 'contrasena-correcta');
    vi.mocked(repositorio.obtenerIdentidadSesion).mockResolvedValue(null);
    await expect(servicio.validarToken(sesion.token))
      .rejects.toMatchObject({ estadoHttp: 401, codigo: 'SESION_INVALIDA' });
  });
});
