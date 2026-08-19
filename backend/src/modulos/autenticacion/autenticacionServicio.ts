import { randomUUID } from 'node:crypto';
import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { ErrorAplicacion } from '../../compartido/errores/errorAplicacion.js';
import { obtenerConfiguracionAutenticacion } from '../../configuracion/configuracion.js';
import type { IdentidadAutenticada } from './autenticacion.interface.js';
import { AutenticacionRepositorio, type IAutenticacionRepositorio } from './autenticacionRepositorio.js';

const opcionesArgon2 = { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export function validarPoliticaContrasena(contrasena: string, nombreUsuario: string): void {
  if (contrasena.length < 1 || contrasena.length > 128
    || contrasena.toLocaleLowerCase() === nombreUsuario.toLocaleLowerCase()) {
    throw new ErrorAplicacion(400, 'CONTRASENA_DEBIL',
      'La contraseña es obligatoria, admite hasta 128 caracteres y debe ser diferente del usuario.');
  }
}

export async function crearHashContrasena(contrasena: string, nombreUsuario: string): Promise<Buffer> {
  validarPoliticaContrasena(contrasena, nombreUsuario);
  return Buffer.from(await argon2.hash(contrasena, opcionesArgon2), 'utf8');
}

export class AutenticacionServicio {
  public constructor(private readonly repositorio: IAutenticacionRepositorio = new AutenticacionRepositorio()) {}

  public async iniciarSesion(nombreUsuario: string, contrasena: string) {
    const usuario = await this.repositorio.buscarUsuario(nombreUsuario);
    if (usuario?.bloqueadoHasta && usuario.bloqueadoHasta.getTime() > Date.now()) {
      throw new ErrorAplicacion(429, 'USUARIO_BLOQUEADO', 'Usuario o contraseña incorrectos.');
    }
    let contrasenaValida = false;
    if (usuario?.activo && usuario.algoritmoContrasena === 'argon2id') {
      contrasenaValida = await argon2.verify(usuario.hashContrasena.toString('utf8'), contrasena);
    } else {
      await argon2.hash(contrasena, opcionesArgon2);
    }
    if (!usuario?.activo || !contrasenaValida) {
      if (usuario?.activo) await this.repositorio.registrarIntentoFallido(usuario.usuarioId);
      throw new ErrorAplicacion(401, 'CREDENCIALES_INVALIDAS', 'Usuario o contraseña incorrectos.');
    }
    await this.repositorio.registrarAccesoCorrecto(usuario.usuarioId);
    const configuracion = obtenerConfiguracionAutenticacion();
    const sesionId = randomUUID();
    const duracionMs = configuracion.duracionMinutos * 60_000;
    await this.repositorio.crearSesion(usuario.usuarioId, sesionId, new Date(Date.now() + duracionMs));
    const token = jwt.sign({}, configuracion.secretoJwt, { algorithm: 'HS256', subject: usuario.usuarioId,
      jwtid: sesionId, expiresIn: configuracion.duracionMinutos * 60,
      issuer: 'appPedidosBodega', audience: 'appPedidosBodega-web' });
    return { token, duracionMs, identidad: { usuarioId: usuario.usuarioId,
      nombreUsuario: usuario.nombreUsuario, nombreVisible: usuario.nombreVisible,
      codigoRol: usuario.codigoRol, codigoAlmacen: usuario.codigoAlmacen, sesionId,
      debeCambiarContrasena: usuario.debeCambiarContrasena } };
  }

  public async validarToken(token: string): Promise<IdentidadAutenticada> {
    try {
      const configuracion = obtenerConfiguracionAutenticacion();
      const contenido = jwt.verify(token, configuracion.secretoJwt, { algorithms: ['HS256'],
        issuer: 'appPedidosBodega', audience: 'appPedidosBodega-web' });
      if (typeof contenido === 'string' || !contenido.jti || !contenido.sub) throw new Error();
      const identidad = await this.repositorio.obtenerIdentidadSesion(contenido.jti);
      if (!identidad || identidad.usuarioId !== contenido.sub) throw new Error();
      return identidad;
    } catch {
      throw new ErrorAplicacion(401, 'SESION_INVALIDA', 'La sesión no es válida o expiró.');
    }
  }

  public async cerrarSesion(sesionId: string): Promise<void> { await this.repositorio.revocarSesion(sesionId); }

  public async cambiarContrasena(identidad: IdentidadAutenticada, actual: string, nueva: string): Promise<void> {
    const usuario = await this.repositorio.buscarUsuario(identidad.nombreUsuario);
    if (!usuario || !await argon2.verify(usuario.hashContrasena.toString('utf8'), actual)) {
      throw new ErrorAplicacion(401, 'CREDENCIALES_INVALIDAS', 'Usuario o contraseña incorrectos.');
    }
    const hash = await crearHashContrasena(nueva, usuario.nombreUsuario);
    await this.repositorio.cambiarContrasena(usuario.usuarioId, hash);
    await this.repositorio.revocarSesionesUsuario(usuario.usuarioId, identidad.sesionId);
  }
}

export { opcionesArgon2 };
