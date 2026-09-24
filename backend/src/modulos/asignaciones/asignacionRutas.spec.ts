import express, { type ErrorRequestHandler } from 'express';
import cookieParser from 'cookie-parser';
import solicitud from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  crearAsignacionRutas,
  esquemaConsultaAsignaciones,
  esquemaGuardarAsignacion,
  puedeAsignarPedidos,
  puedeReasignarPedidos,
  esquemaReasignar,
  resolverTecnicoAsignable,
  tecnicosAsignables,
  usuariosAsignablesParaSesion,
} from './asignacionRutas.js';
import type { AsignacionRepositorio } from './asignacionRepositorio.js';
import { AutenticacionServicio } from '../autenticacion/autenticacionServicio.js';
import { requerirAutenticacion, requerirContrasenaActualizada } from '../autenticacion/autenticacionMiddleware.js';
import { ErrorAplicacion } from '../../compartido/errores/errorAplicacion.js';
import type { IdentidadAutenticada } from '../autenticacion/autenticacion.interface.js';

const usuarioNormal = {
  codigoRol: 'OPERADOR_BODEGA',
  nombreUsuario: 'otro',
  nombreVisible: 'Otro usuario',
};

describe('asignaciones de artículos', () => {
  it('permite asignar a administradores, gcruz, acalix, jlara, Tommy y bodega TBM', () => {
    expect(puedeAsignarPedidos('ADMINISTRADOR', 'sistemas')).toBe(true);
    expect(puedeAsignarPedidos('OPERADOR_BODEGA', 'GCRUZ')).toBe(true);
    expect(puedeAsignarPedidos('CONSULTA', 'ACALIX')).toBe(true);
    expect(puedeAsignarPedidos('CONSULTA', 'JLARA')).toBe(true);
    expect(puedeAsignarPedidos('CONSULTA', 'TLOPEZ')).toBe(true);
    expect(puedeAsignarPedidos('OPERADOR_BODEGA', 'BODEGATBM')).toBe(true);
    expect(puedeAsignarPedidos('OPERADOR_BODEGA', 'otro')).toBe(false);
    expect(puedeAsignarPedidos('CONSULTA', 'otro')).toBe(false);
  });

  it('mantiene el catálogo autorizado de siete técnicos', () => {
    expect(tecnicosAsignables).toHaveLength(7);
    expect(tecnicosAsignables.map(({ usuario }) => usuario)).toEqual([
      'mperez', 'gcruz', 'operdomo', 'omencia', 'maperdomo', 'osmith', 'dvelasquez',
    ]);
  });

  it('no ofrece asignación manual a un usuario normal y conserva la lista completa privilegiada', () => {
    expect(usuariosAsignablesParaSesion(usuarioNormal)).toEqual([]);
    expect(usuariosAsignablesParaSesion({
      ...usuarioNormal, codigoRol: 'ADMINISTRADOR',
    })).toEqual(tecnicosAsignables);
    expect(usuariosAsignablesParaSesion({
      ...usuarioNormal, nombreUsuario: 'gcruz',
    })).toEqual(tecnicosAsignables);
  });

  it('limita ACALIX y JLARA a Jorge Lara y Ana Calix', () => {
    const opcionesEsperadas = [
      { usuario: 'jlara', nombre: 'Jorge Lara' },
      { usuario: 'acalix', nombre: 'Ana Calix' },
    ];
    expect(usuariosAsignablesParaSesion({
      ...usuarioNormal, nombreUsuario: 'ACALIX', nombreVisible: 'Ana Calix',
    })).toEqual(opcionesEsperadas);
    expect(usuariosAsignablesParaSesion({
      ...usuarioNormal, nombreUsuario: 'JLARA', nombreVisible: 'Jorge Lara',
    })).toEqual(opcionesEsperadas);
    expect(resolverTecnicoAsignable({
      ...usuarioNormal, nombreUsuario: 'ACALIX', nombreVisible: 'Ana Calix',
    }, 'jlara')).toEqual({ usuario: 'jlara', nombre: 'Jorge Lara' });
  });

  it('ofrece únicamente a Tommy para su asignación manual', () => {
    const tommy = { ...usuarioNormal, nombreUsuario: 'tlopez', nombreVisible: 'Tommy López' };
    expect(usuariosAsignablesParaSesion(tommy)).toEqual([
      { usuario: 'tlopez', nombre: 'Tommy López' },
    ]);
    expect(resolverTecnicoAsignable(tommy, 'tlopez')).toEqual(
      { usuario: 'tlopez', nombre: 'Tommy López' });
    expect(() => resolverTecnicoAsignable(tommy, 'gcruz')).toThrow(
      'El usuario seleccionado no está disponible.');
  });

  it('ofrece únicamente a Kevin Carranza para la asignación de bodega TBM', () => {
    const kevin = { ...usuarioNormal, nombreUsuario: 'bodegatbm', nombreVisible: 'Bodega TBM' };
    expect(usuariosAsignablesParaSesion(kevin)).toEqual([
      { usuario: 'bodegatbm', nombre: 'Kevin Carranza' },
    ]);
    expect(resolverTecnicoAsignable(kevin, 'bodegatbm')).toEqual(
      { usuario: 'bodegatbm', nombre: 'Kevin Carranza' });
    expect(() => resolverTecnicoAsignable(kevin, 'gcruz')).toThrow(
      'El usuario seleccionado no está disponible.');
  });

  it('permite a Tommy confirmar solamente pedidos de Circunvalación', async () => {
    const guardar = vi.fn().mockResolvedValue({ confirmada: true, asignacion: {
      idOrigen: 'R1:TCIR01:F1', identificadorDetalle: '1', usuarioAsignado: 'tlopez',
      nombreAsignado: 'Tommy López', actualizadoEn: new Date(),
    } });
    const aplicacion = express();
    aplicacion.use(express.json());
    aplicacion.use((peticion, _respuesta, siguiente) => { peticion.user = {
      usuarioId: '00000000-0000-0000-0000-000000000001', nombreUsuario: 'tlopez',
      nombreVisible: 'Tommy López', codigoRol: 'OPERADOR_BODEGA', codigoAlmacen: 'TCIR01',
      sesionId: 'sesion-prueba', debeCambiarContrasena: false,
    }; siguiente(); });
    aplicacion.use('/api/pedidos/asignaciones', crearAsignacionRutas({ guardar } as unknown as AsignacionRepositorio));

    const permitido = await solicitud(aplicacion).patch('/api/pedidos/asignaciones')
      .send({ idOrigen: 'R1:TCIR01:F1', identificadorDetalle: '1', usuarioAsignado: 'tlopez' });
    const rechazado = await solicitud(aplicacion).patch('/api/pedidos/asignaciones')
      .send({ idOrigen: 'R1:TSPS01:F2', identificadorDetalle: '1', usuarioAsignado: 'tlopez' });
    expect(permitido.status).toBe(200);
    expect(rechazado.status).toBe(403);
    expect(guardar).toHaveBeenCalledOnce();
  });

  it('permite a Kevin confirmar solamente pedidos de TBM', async () => {
    const guardar = vi.fn().mockResolvedValue({ confirmada: true, asignacion: {
      idOrigen: 'R1:TTBM01:F1', identificadorDetalle: '1', usuarioAsignado: 'bodegatbm',
      nombreAsignado: 'Kevin Carranza', actualizadoEn: new Date(),
    } });
    const aplicacion = express();
    aplicacion.use(express.json());
    aplicacion.use((peticion, _respuesta, siguiente) => { peticion.user = {
      usuarioId: '00000000-0000-0000-0000-000000000001', nombreUsuario: 'bodegatbm',
      nombreVisible: 'Bodega TBM', codigoRol: 'OPERADOR_BODEGA', codigoAlmacen: null,
      sesionId: 'sesion-prueba', debeCambiarContrasena: false,
    }; siguiente(); });
    aplicacion.use('/api/pedidos/asignaciones', crearAsignacionRutas({ guardar } as unknown as AsignacionRepositorio));

    const permitido = await solicitud(aplicacion).patch('/api/pedidos/asignaciones')
      .send({ idOrigen: 'R1:TTBM01:F1', identificadorDetalle: '1', usuarioAsignado: 'bodegatbm' });
    const rechazado = await solicitud(aplicacion).patch('/api/pedidos/asignaciones')
      .send({ idOrigen: 'R1:TSPS01:F2', identificadorDetalle: '1', usuarioAsignado: 'bodegatbm' });
    expect(permitido.status).toBe(200);
    expect(rechazado.status).toBe(403);
    expect(guardar).toHaveBeenCalledOnce();
  });

  it('impide la asignación manual a los usuarios normales', () => {
    expect(() => resolverTecnicoAsignable(usuarioNormal, 'TLOPEZ'))
      .toThrow('No tiene permisos para asignar pedidos.');
    expect(() => resolverTecnicoAsignable(usuarioNormal, 'gcruz'))
      .toThrow('No tiene permisos para asignar pedidos.');
  });

  it.each(['acalix', 'jlara'])('expone solamente las dos opciones permitidas para %s', async (nombreUsuario) => {
    const aplicacion = express();
    aplicacion.use((peticion, _respuesta, siguiente) => {
      peticion.user = {
        usuarioId: '00000000-0000-0000-0000-000000000001',
        nombreUsuario,
        nombreVisible: nombreUsuario === 'acalix' ? 'Ana Calix' : 'Jorge Lara',
        codigoRol: 'OPERADOR_BODEGA',
        codigoAlmacen: null,
        sesionId: 'sesion-prueba',
        debeCambiarContrasena: false,
      };
      siguiente();
    });
    aplicacion.use('/api/pedidos/asignaciones', crearAsignacionRutas({} as AsignacionRepositorio));

    const respuesta = await solicitud(aplicacion).get('/api/pedidos/asignaciones/usuarios');

    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toEqual({
      datos: [
        { usuario: 'jlara', nombre: 'Jorge Lara' },
        { usuario: 'acalix', nombre: 'Ana Calix' },
      ],
      puedeAsignar: true,
      puedeAsignarTodos: false,
      puedeReasignar: true,
    });
  });

  it.each([
    ['sistemas', 'ADMINISTRADOR'],
    ['gcruz', 'OPERADOR_BODEGA'],
  ])('conserva la lista completa para %s', async (nombreUsuario, codigoRol) => {
    const aplicacion = express();
    aplicacion.use((peticion, _respuesta, siguiente) => {
      peticion.user = {
        usuarioId: '00000000-0000-0000-0000-000000000001',
        nombreUsuario,
        nombreVisible: nombreUsuario,
        codigoRol,
        codigoAlmacen: null,
        sesionId: 'sesion-prueba',
        debeCambiarContrasena: false,
      };
      siguiente();
    });
    aplicacion.use('/api/pedidos/asignaciones', crearAsignacionRutas({} as AsignacionRepositorio));

    const respuesta = await solicitud(aplicacion).get('/api/pedidos/asignaciones/usuarios');

    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toEqual({
      datos: tecnicosAsignables,
      puedeAsignar: true,
      puedeAsignarTodos: true,
      puedeReasignar: true,
    });
  });

  it('responde 403 si un usuario normal intenta utilizar la asignación manual', async () => {
    const aplicacion = express();
    aplicacion.use(express.json());
    aplicacion.use((peticion, _respuesta, siguiente) => {
      peticion.user = {
        usuarioId: '00000000-0000-0000-0000-000000000001',
        nombreUsuario: usuarioNormal.nombreUsuario,
        nombreVisible: usuarioNormal.nombreVisible,
        codigoRol: usuarioNormal.codigoRol,
        codigoAlmacen: null,
        sesionId: 'sesion-prueba',
        debeCambiarContrasena: false,
      };
      siguiente();
    });
    aplicacion.use('/api/pedidos/asignaciones', crearAsignacionRutas({} as AsignacionRepositorio));

    const respuesta = await solicitud(aplicacion)
      .patch('/api/pedidos/asignaciones')
      .send({ idOrigen: 'R1:F1', identificadorDetalle: '1', usuarioAsignado: 'gcruz' });

    expect(respuesta.status).toBe(403);
    expect(respuesta.body).toEqual({
      exito: false,
      mensaje: 'No tiene permisos para asignar pedidos.',
    });
  });

  it('ya no expone el endpoint de autoasignación', async () => {
    const aplicacion = express();
    aplicacion.use(express.json());
    aplicacion.use((peticion, _respuesta, siguiente) => {
      peticion.user = {
        usuarioId: '00000000-0000-0000-0000-000000000001',
        nombreUsuario: usuarioNormal.nombreUsuario,
        nombreVisible: usuarioNormal.nombreVisible,
        codigoRol: usuarioNormal.codigoRol,
        codigoAlmacen: null,
        sesionId: 'sesion-prueba',
        debeCambiarContrasena: false,
      };
      siguiente();
    });
    aplicacion.use('/api/pedidos/asignaciones', crearAsignacionRutas({} as AsignacionRepositorio));

    const respuesta = await solicitud(aplicacion)
      .post('/api/pedidos/asignaciones/autoasignar')
      .send({ lineas: [{ idOrigen: 'R1:F1', identificadorDetalle: '1' }] });

    expect(respuesta.status).toBe(404);
  });

  it('confirma una asignación disponible para un administrador', async () => {
    const asignacion = {
      idOrigen: 'R1:F1', identificadorDetalle: '1',
      usuarioAsignado: 'mperez', nombreAsignado: 'Marcos Perez', actualizadoEn: new Date(),
    };
    const guardar = vi.fn().mockResolvedValue({ asignacion, confirmada: true });
    const aplicacion = express();
    aplicacion.use(express.json());
    aplicacion.use((peticion, _respuesta, siguiente) => {
      peticion.user = {
        usuarioId: '00000000-0000-0000-0000-000000000001',
        nombreUsuario: 'sistemas', nombreVisible: 'Sistemas', codigoRol: 'ADMINISTRADOR',
        codigoAlmacen: null, sesionId: 'sesion-prueba', debeCambiarContrasena: false,
      };
      siguiente();
    });
    aplicacion.use('/api/pedidos/asignaciones', crearAsignacionRutas({
      guardar,
    } as unknown as AsignacionRepositorio));

    const respuesta = await solicitud(aplicacion)
      .patch('/api/pedidos/asignaciones')
      .send({ idOrigen: 'R1:F1', identificadorDetalle: '1', usuarioAsignado: 'mperez' });

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.datos).toMatchObject({ usuarioAsignado: 'mperez' });
  });

  it('devuelve la asignación ganadora cuando otra persona ya confirmó la partida', async () => {
    const asignacion = {
      idOrigen: 'R1:F1', identificadorDetalle: '1',
      usuarioAsignado: 'mperez', nombreAsignado: 'Marcos Perez', actualizadoEn: new Date(),
    };
    const guardar = vi.fn().mockResolvedValue({ asignacion, confirmada: false });
    const aplicacion = express();
    aplicacion.use(express.json());
    aplicacion.use((peticion, _respuesta, siguiente) => {
      peticion.user = {
        usuarioId: '00000000-0000-0000-0000-000000000002',
        nombreUsuario: 'gcruz', nombreVisible: 'Gregorio Cruz', codigoRol: 'OPERADOR_BODEGA',
        codigoAlmacen: null, sesionId: 'otra-sesion', debeCambiarContrasena: false,
      };
      siguiente();
    });
    aplicacion.use('/api/pedidos/asignaciones', crearAsignacionRutas({
      guardar,
    } as unknown as AsignacionRepositorio));

    const respuesta = await solicitud(aplicacion)
      .patch('/api/pedidos/asignaciones')
      .send({ idOrigen: 'R1:F1', identificadorDetalle: '1', usuarioAsignado: 'gcruz' });

    expect(respuesta.status).toBe(409);
    expect(respuesta.body).toMatchObject({
      exito: false,
      mensaje: 'Este pedido/artículo ya fue asignado.',
      datos: { usuarioAsignado: 'mperez', nombreAsignado: 'Marcos Perez' },
    });
  });

  it('valida identidades estables y exige un técnico para confirmar', () => {
    expect(esquemaConsultaAsignaciones.safeParse({
      lineas: [{ idOrigen: 'R1:F1', identificadorDetalle: '1' }],
    }).success).toBe(true);
    expect(esquemaGuardarAsignacion.safeParse({
      idOrigen: 'R1:F1', identificadorDetalle: '1', usuarioAsignado: null,
    }).success).toBe(false);
    expect(esquemaGuardarAsignacion.safeParse({
      idOrigen: '', identificadorDetalle: '1', usuarioAsignado: 'gcruz',
    }).success).toBe(false);
  });
});

describe('reasignación restaurada y autenticada', () => {
  let usuario: IdentidadAutenticada;
  const actualizadoEn = '2026-09-17T14:00:00.000Z';
  const datos = { idOrigen: 'R1:TSPS01:QA', identificadorDetalle: '1', usuarioAsignado: 'mperez', actualizadoEn };
  const reasignar = vi.fn();
  const guardar = vi.fn();
  const app = express();
  app.use(express.json(), cookieParser());
  app.use('/api/pedidos/asignaciones', requerirAutenticacion, requerirContrasenaActualizada,
    crearAsignacionRutas({ reasignar, guardar } as unknown as AsignacionRepositorio));
  const errores: ErrorRequestHandler = (error, _peticion, respuesta, siguiente) => {
    if (respuesta.headersSent) { siguiente(error); return; }
    respuesta.status(error instanceof ErrorAplicacion ? error.estadoHttp : 400).json({ mensaje: error.message });
  };
  app.use(errores);

  beforeEach(() => {
    usuario = { usuarioId: '00000000-0000-0000-0000-000000000001', nombreUsuario: 'sistemas',
      nombreVisible: 'Sistemas', codigoRol: 'ADMINISTRADOR', codigoAlmacen: null,
      sesionId: 'sesion-prueba', debeCambiarContrasena: false };
    vi.spyOn(AutenticacionServicio.prototype, 'validarToken').mockImplementation(async () => usuario);
    guardar.mockReset();
    reasignar.mockReset().mockResolvedValue({ actualizada: true, asignacion: {
      ...datos, nombreAsignado: 'Marcos Perez', actualizadoEn: new Date('2026-09-17T14:01:00Z'),
    } });
  });
  afterEach(() => vi.restoreAllMocks());

  it('sin sesión devuelve 401 y no escribe', async () => {
    await solicitud(app).patch('/api/pedidos/asignaciones/reasignar').send(datos).expect(401);
    expect(reasignar).not.toHaveBeenCalled();
  });

  it.each([
    ['sistemas', 'ADMINISTRADOR', 'mperez', 'R1:TSPS01:QA'],
    ['gcruz', 'OPERADOR_BODEGA', 'osmith', 'R1:TSPS01:QA'],
    ['jlara', 'OPERADOR_BODEGA', 'acalix', 'R1:TSPS01:QA'],
    ['acalix', 'OPERADOR_BODEGA', 'jlara', 'R1:TSPS01:QA'],
    ['tlopez', 'OPERADOR_BODEGA', 'tlopez', 'R1:TCIR01:QA'],
    ['bodegatbm', 'OPERADOR_BODEGA', 'bodegatbm', 'R1:TTBM01:QA'],
  ])('restaura %s sin ampliar su catálogo', async (nombreUsuario, codigoRol, destino, idOrigen) => {
    usuario = { ...usuario, nombreUsuario, codigoRol };
    expect(puedeReasignarPedidos(codigoRol, nombreUsuario)).toBe(true);
    const catalogo = await solicitud(app).get('/api/pedidos/asignaciones/usuarios').set('Cookie', 'pb_sesion=token').expect(200);
    expect(catalogo.body.puedeReasignar).toBe(true);
    if (nombreUsuario === 'jlara' || nombreUsuario === 'acalix') expect(catalogo.body.datos.map((t: { usuario: string }) => t.usuario)).toEqual(['jlara', 'acalix']);
    if (nombreUsuario === 'tlopez') expect(catalogo.body.datos.map((t: { usuario: string }) => t.usuario)).toEqual(['tlopez']);
    if (nombreUsuario === 'bodegatbm') expect(catalogo.body.datos.map((t: { usuario: string }) => t.usuario)).toEqual(['bodegatbm']);
    const cuerpo = { ...datos, idOrigen, usuarioAsignado: destino };
    await solicitud(app).patch('/api/pedidos/asignaciones/reasignar').set('Cookie', 'pb_sesion=token').send(cuerpo).expect(200);
    expect(reasignar).toHaveBeenCalledWith(cuerpo, expect.objectContaining({ usuario: destino }), usuario.usuarioId, new Date(actualizadoEn));
    expect(guardar).not.toHaveBeenCalled();
  });

  it('otro usuario conserva 403 y no accede al repositorio', async () => {
    usuario = { ...usuario, nombreUsuario: 'otro', codigoRol: 'OPERADOR_BODEGA' };
    expect(puedeReasignarPedidos(usuario.codigoRol, usuario.nombreUsuario)).toBe(false);
    await solicitud(app).patch('/api/pedidos/asignaciones/reasignar').set('Cookie', 'pb_sesion=token').send(datos).expect(403);
    expect(reasignar).not.toHaveBeenCalled();
  });

  it.each(['jlara', 'acalix', 'tlopez', 'bodegatbm'])('%s no puede reasignar fuera de su lista', async (nombreUsuario) => {
    usuario = { ...usuario, nombreUsuario, codigoRol: 'OPERADOR_BODEGA' };
    await solicitud(app).patch('/api/pedidos/asignaciones/reasignar').set('Cookie', 'pb_sesion=token')
      .send({ ...datos, idOrigen: nombreUsuario === 'tlopez' ? 'R1:TCIR01:QA'
        : nombreUsuario === 'bodegatbm' ? 'R1:TTBM01:QA' : datos.idOrigen, usuarioAsignado: 'gcruz' }).expect(400);
    expect(reasignar).not.toHaveBeenCalled();
  });

  it('Tommy conserva la restricción de Circunvalación', async () => {
    usuario = { ...usuario, nombreUsuario: 'tlopez', codigoRol: 'OPERADOR_BODEGA' };
    await solicitud(app).patch('/api/pedidos/asignaciones/reasignar').set('Cookie', 'pb_sesion=token')
      .send({ ...datos, usuarioAsignado: 'tlopez' }).expect(403);
    expect(reasignar).not.toHaveBeenCalled();
  });

  it('Kevin conserva la restricción de TBM', async () => {
    usuario = { ...usuario, nombreUsuario: 'bodegatbm', codigoRol: 'OPERADOR_BODEGA' };
    await solicitud(app).patch('/api/pedidos/asignaciones/reasignar').set('Cookie', 'pb_sesion=token')
      .send({ ...datos, usuarioAsignado: 'bodegatbm' }).expect(403);
    expect(reasignar).not.toHaveBeenCalled();
  });

  it('devuelve 409 y responsable vigente si la versión de la línea ya cambió', async () => {
    reasignar.mockResolvedValue({ actualizada: false, asignacion: { ...datos, usuarioAsignado: 'gcruz' } });
    const respuesta = await solicitud(app).patch('/api/pedidos/asignaciones/reasignar').set('Cookie', 'pb_sesion=token').send(datos).expect(409);
    expect(respuesta.body).toMatchObject({ exito: false, datos: { usuarioAsignado: 'gcruz' } });
  });

  it('valida identidad, responsable y versión, sin aceptar suplantar usuario', () => {
    expect(esquemaReasignar.safeParse(datos).success).toBe(true);
    for (const cambio of [{ idOrigen: '' }, { identificadorDetalle: '' }, { usuarioAsignado: '' }, { actualizadoEn: 'ayer' }, { usuarioId: 'otra-persona' }]) {
      expect(esquemaReasignar.safeParse({ ...datos, ...cambio }).success).toBe(false);
    }
  });
});
