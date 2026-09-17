import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type ErrorRequestHandler } from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { esquemaLineasImpresion, esquemaRegistroImpresion, impresionRutas } from './impresionRutas.js';
import { ImpresionRepositorio } from './impresionRepositorio.js';
import { AsignacionRepositorio } from '../asignaciones/asignacionRepositorio.js';
import { AutenticacionServicio } from '../autenticacion/autenticacionServicio.js';
import { requerirAutenticacion, requerirContrasenaActualizada } from '../autenticacion/autenticacionMiddleware.js';
import { ErrorAplicacion } from '../../compartido/errores/errorAplicacion.js';
import type { IdentidadAutenticada } from '../autenticacion/autenticacion.interface.js';

describe('esquemaLineasImpresion', () => {
  it('acepta identidades estables de artículos', () => {
    expect(esquemaLineasImpresion.parse({
      lineas: [{ idOrigen: ' R1:ABC ', identificadorDetalle: ' 12 ' }],
    })).toEqual({ lineas: [{ idOrigen: 'R1:ABC', identificadorDetalle: '12' }] });
  });

  it('rechaza una impresión sin artículos identificables', () => {
    expect(() => esquemaLineasImpresion.parse({ lineas: [] })).toThrow();
    expect(() => esquemaLineasImpresion.parse({
      lineas: [{ idOrigen: 'R1:ABC', identificadorDetalle: '' }],
    })).toThrow();
  });
});

describe('registro autenticado de impresión', () => {
  const identidad: IdentidadAutenticada = {
    usuarioId: '11111111-1111-4111-8111-111111111111', nombreUsuario: 'jlara',
    nombreVisible: 'Jorge Lara', codigoRol: 'OPERADOR_BODEGA', codigoAlmacen: null,
    sesionId: '22222222-2222-4222-8222-222222222222', debeCambiarContrasena: false,
  };
  const lineas = [{ idOrigen: 'R1:F1', identificadorDetalle: '1', codigoArticulo: 'ART-1' }];
  const app = express();
  app.use(express.json(), cookieParser());
  app.use('/api/impresiones', requerirAutenticacion, requerirContrasenaActualizada, impresionRutas);
  const errores: ErrorRequestHandler = (error, _solicitud, respuesta, siguiente) => {
    if (respuesta.headersSent) { siguiente(error); return; }
    respuesta.status(error instanceof ErrorAplicacion ? error.estadoHttp : 400).json({ mensaje: error.message });
  };
  app.use(errores);

  beforeEach(() => {
    vi.spyOn(AutenticacionServicio.prototype, 'validarToken').mockResolvedValue(identidad);
    vi.spyOn(AsignacionRepositorio.prototype, 'consultar').mockResolvedValue([]);
    vi.spyOn(ImpresionRepositorio.prototype, 'registrar').mockResolvedValue([]);
    vi.spyOn(ImpresionRepositorio.prototype, 'consultar').mockResolvedValue([]);
  });
  afterEach(() => vi.restoreAllMocks());

  it('exige sesión para consultar y registrar, sin invocar repositorios', async () => {
    await request(app).post('/api/impresiones/registrar').send({ lineas }).expect(401);
    await request(app).post('/api/impresiones/consultar').send({ lineas: [{ idOrigen: 'R1:F1', identificadorDetalle: '1' }] }).expect(401);
    expect(ImpresionRepositorio.prototype.registrar).not.toHaveBeenCalled();
    expect(ImpresionRepositorio.prototype.consultar).not.toHaveBeenCalled();
  });

  it('obtiene el usuario del token, nunca del nombre del frontend', async () => {
    await request(app).post('/api/impresiones/registrar').set('Cookie', 'pb_sesion=token').send({ lineas }).expect(200);
    expect(ImpresionRepositorio.prototype.registrar).toHaveBeenCalledWith(lineas, identidad.usuarioId);
  });

  it('rechaza suplantación en el cuerpo y líneas no identificables', async () => {
    expect(() => esquemaRegistroImpresion.parse({ lineas, usuarioId: 'otro' })).toThrow();
    expect(() => esquemaRegistroImpresion.parse({ lineas: [{ ...lineas[0], nombreVisible: 'Otro' }] })).toThrow();
    expect(() => esquemaRegistroImpresion.parse({ lineas: [] })).toThrow();
    expect(() => esquemaRegistroImpresion.parse({ lineas: [{ ...lineas[0], codigoArticulo: '' }] })).toThrow();
    await request(app).post('/api/impresiones/registrar').set('Cookie', 'pb_sesion=token')
      .send({ lineas, usuarioId: 'otro' }).expect(400);
    expect(ImpresionRepositorio.prototype.registrar).not.toHaveBeenCalled();
  });

  it('conserva la prohibición de registrar la partida asignada a otro usuario', async () => {
    vi.mocked(AsignacionRepositorio.prototype.consultar).mockResolvedValue([{
      idOrigen: 'R1:F1', identificadorDetalle: '1', usuarioAsignado: 'acalix', nombreAsignado: 'Ana Calix',
      asignadoEn: new Date('2026-09-16T10:00:00Z'), actualizadoEn: new Date('2026-09-16T10:00:00Z'),
    }]);
    await request(app).post('/api/impresiones/registrar').set('Cookie', 'pb_sesion=token').send({ lineas }).expect(403);
    expect(ImpresionRepositorio.prototype.registrar).not.toHaveBeenCalled();
  });

  it.each([
    { nombreUsuario: 'gcruz', codigoRol: 'OPERADOR_BODEGA' },
    { nombreUsuario: 'sistemas', codigoRol: 'ADMINISTRADOR' },
  ])('conserva acceso supervisor de $nombreUsuario', async (supervisor) => {
    vi.mocked(AutenticacionServicio.prototype.validarToken).mockResolvedValue({ ...identidad, ...supervisor });
    await request(app).post('/api/impresiones/registrar').set('Cookie', 'pb_sesion=token').send({ lineas }).expect(200);
    expect(AsignacionRepositorio.prototype.consultar).not.toHaveBeenCalled();
  });

  it('dos sesiones registran sus propios usuarios en solicitudes independientes', async () => {
    vi.mocked(AutenticacionServicio.prototype.validarToken).mockImplementation(async (token) => ({
      ...identidad, usuarioId: token === 'A' ? identidad.usuarioId : '33333333-3333-4333-8333-333333333333',
    }));
    await Promise.all([
      request(app).post('/api/impresiones/registrar').set('Cookie', 'pb_sesion=A').send({ lineas }).expect(200),
      request(app).post('/api/impresiones/registrar').set('Cookie', 'pb_sesion=B').send({ lineas }).expect(200),
    ]);
    expect(ImpresionRepositorio.prototype.registrar).toHaveBeenCalledTimes(2);
    expect(ImpresionRepositorio.prototype.registrar).toHaveBeenCalledWith(lineas, identidad.usuarioId);
    expect(ImpresionRepositorio.prototype.registrar).toHaveBeenCalledWith(lineas, '33333333-3333-4333-8333-333333333333');
  });
});
