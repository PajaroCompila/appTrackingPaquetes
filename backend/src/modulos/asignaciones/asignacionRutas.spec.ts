import express from 'express';
import solicitud from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import {
  crearAsignacionRutas,
  esquemaConsultaAsignaciones,
  esquemaGuardarAsignacion,
  puedeAsignarPedidos,
  puedeReasignarPedidos,
  resolverTecnicoAsignable,
  tecnicosAsignables,
  usuariosAsignablesParaSesion,
} from './asignacionRutas.js';
import type { AsignacionRepositorio } from './asignacionRepositorio.js';

const usuarioNormal = {
  codigoRol: 'OPERADOR_BODEGA',
  nombreUsuario: 'otro',
  nombreVisible: 'Otro usuario',
};

describe('asignaciones de artículos', () => {
  it('entrega la hora del servidor y conserva la fecha de la primera asignacion', async () => {
    const asignadoEn = new Date('2026-09-10T15:00:00.000Z');
    const consultar = vi.fn().mockResolvedValue([{
      idOrigen: 'R1:F1', identificadorDetalle: '1',
      usuarioAsignado: 'gcruz', nombreAsignado: 'Gregorio Cruz',
      asignadoEn, actualizadoEn: new Date('2026-09-10T15:04:00.000Z'),
    }]);
    const aplicacion = express();
    aplicacion.use(express.json());
    aplicacion.use('/api/pedidos/asignaciones', crearAsignacionRutas({
      consultar,
    } as unknown as AsignacionRepositorio));

    const respuesta = await solicitud(aplicacion)
      .post('/api/pedidos/asignaciones/consultar')
      .send({ lineas: [{ idOrigen: 'R1:F1', identificadorDetalle: '1' }] });

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.datos[0].asignadoEn).toBe(asignadoEn.toISOString());
    expect(Number.isFinite(Date.parse(respuesta.body.horaServidor))).toBe(true);
    expect(consultar).toHaveBeenCalledWith([
      { idOrigen: 'R1:F1', identificadorDetalle: '1' },
    ]);
  });

  it('permite asignar a administradores, gcruz, acalix, jlara y Tommy', () => {
    expect(puedeAsignarPedidos('ADMINISTRADOR', 'sistemas')).toBe(true);
    expect(puedeAsignarPedidos('OPERADOR_BODEGA', 'GCRUZ')).toBe(true);
    expect(puedeAsignarPedidos('CONSULTA', 'ACALIX')).toBe(true);
    expect(puedeAsignarPedidos('CONSULTA', 'JLARA')).toBe(true);
    expect(puedeAsignarPedidos('CONSULTA', 'TLOPEZ')).toBe(true);
    expect(puedeAsignarPedidos('OPERADOR_BODEGA', 'otro')).toBe(false);
    expect(puedeAsignarPedidos('CONSULTA', 'otro')).toBe(false);
  });

  it('permite reasignar solamente al administrador y a gcruz', () => {
    expect(puedeReasignarPedidos('ADMINISTRADOR', 'sistemas')).toBe(true);
    expect(puedeReasignarPedidos('OPERADOR_BODEGA', 'gcruz')).toBe(true);
    expect(puedeReasignarPedidos('OPERADOR_BODEGA', 'acalix')).toBe(false);
    expect(puedeReasignarPedidos('OPERADOR_BODEGA', 'jlara')).toBe(false);
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
      puedeReasignar: false,
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

  it('reasigna con versión esperada y rechaza una versión que ya cambió', async () => {
    const actualizadaEn = new Date('2026-09-09T15:00:00.000Z');
    const asignacion = { idOrigen: 'R1:F1', identificadorDetalle: '1',
      usuarioAsignado: 'gcruz', nombreAsignado: 'Gregorio Cruz', actualizadoEn: new Date() };
    const reasignar = vi.fn()
      .mockResolvedValueOnce({ asignacion, actualizada: true })
      .mockResolvedValueOnce({ asignacion, actualizada: false });
    const aplicacion = express();
    aplicacion.use(express.json());
    aplicacion.use((peticion, _respuesta, siguiente) => { peticion.user = {
      usuarioId: '00000000-0000-0000-0000-000000000001', nombreUsuario: 'sistemas',
      nombreVisible: 'Sistemas', codigoRol: 'ADMINISTRADOR', codigoAlmacen: null,
      sesionId: 'sesion-prueba', debeCambiarContrasena: false,
    }; siguiente(); });
    aplicacion.use('/api/pedidos/asignaciones', crearAsignacionRutas({
      reasignar,
    } as unknown as AsignacionRepositorio));
    const cuerpo = { idOrigen: 'R1:F1', identificadorDetalle: '1', usuarioAsignado: 'gcruz',
      actualizadoEn: actualizadaEn.toISOString() };

    const guardada = await solicitud(aplicacion).patch('/api/pedidos/asignaciones/reasignar').send(cuerpo);
    const conflicto = await solicitud(aplicacion).patch('/api/pedidos/asignaciones/reasignar').send(cuerpo);

    expect(guardada.status).toBe(200);
    expect(conflicto.status).toBe(409);
    expect(reasignar).toHaveBeenCalledWith(expect.objectContaining({ idOrigen: 'R1:F1' }),
      expect.objectContaining({ usuario: 'gcruz' }), expect.any(String), actualizadaEn);
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
