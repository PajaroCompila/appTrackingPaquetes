import express from 'express';
import solicitud from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import {
  crearAsignacionRutas,
  esquemaConsultaAsignaciones,
  esquemaGuardarAsignacion,
  puedeAsignarPedidos,
  resolverTecnicoAsignable,
  tecnicosAsignables,
  usuariosAsignablesParaSesion,
} from './asignacionRutas.js';
import type { AsignacionRepositorio } from './asignacionRepositorio.js';

const usuarioNormal = {
  codigoRol: 'OPERADOR_BODEGA',
  nombreUsuario: 'tlopez',
  nombreVisible: 'Tommy López',
};

describe('asignaciones de artículos', () => {
  it('permite asignar solamente a administradores y a gcruz', () => {
    expect(puedeAsignarPedidos('ADMINISTRADOR', 'sistemas')).toBe(true);
    expect(puedeAsignarPedidos('OPERADOR_BODEGA', 'GCRUZ')).toBe(true);
    expect(puedeAsignarPedidos('OPERADOR_BODEGA', 'otro')).toBe(false);
    expect(puedeAsignarPedidos('CONSULTA', 'otro')).toBe(false);
  });

  it('mantiene el catálogo autorizado de siete técnicos', () => {
    expect(tecnicosAsignables).toHaveLength(7);
    expect(tecnicosAsignables.map(({ usuario }) => usuario)).toEqual([
      'mperez', 'gcruz', 'operdomo', 'omencia', 'maperdomo', 'osmith', 'dvelasquez',
    ]);
  });

  it('devuelve solamente la cuenta de la sesión para un usuario normal', () => {
    expect(usuariosAsignablesParaSesion(usuarioNormal)).toEqual([
      { usuario: 'tlopez', nombre: 'Tommy López' },
    ]);
    expect(usuariosAsignablesParaSesion({
      ...usuarioNormal, codigoRol: 'ADMINISTRADOR',
    })).toEqual(tecnicosAsignables);
    expect(usuariosAsignablesParaSesion({
      ...usuarioNormal, nombreUsuario: 'gcruz',
    })).toEqual(tecnicosAsignables);
  });

  it('impide la asignación manual a los usuarios normales', () => {
    expect(() => resolverTecnicoAsignable(usuarioNormal, 'TLOPEZ'))
      .toThrow('La asignación para este usuario se realiza automáticamente.');
    expect(() => resolverTecnicoAsignable(usuarioNormal, 'gcruz'))
      .toThrow('La asignación para este usuario se realiza automáticamente.');
    expect(() => resolverTecnicoAsignable(usuarioNormal, null))
      .toThrow('La asignación para este usuario se realiza automáticamente.');
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
      mensaje: 'La asignación para este usuario se realiza automáticamente.',
    });
  });

  it('autoasigna líneas libres al usuario normal de la sesión', async () => {
    const asignarAutomaticamente = vi.fn().mockResolvedValue([{
      idOrigen: 'R1:F1', identificadorDetalle: '1',
      usuarioAsignado: 'tlopez', nombreAsignado: 'Tommy López', actualizadoEn: new Date(),
    }]);
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
    aplicacion.use('/api/pedidos/asignaciones', crearAsignacionRutas({
      asignarAutomaticamente,
    } as unknown as AsignacionRepositorio));

    const respuesta = await solicitud(aplicacion)
      .post('/api/pedidos/asignaciones/autoasignar')
      .send({ lineas: [{ idOrigen: 'R1:F1', identificadorDetalle: '1' }] });

    expect(respuesta.status).toBe(200);
    expect(asignarAutomaticamente).toHaveBeenCalledWith(
      [{ idOrigen: 'R1:F1', identificadorDetalle: '1' }],
      { usuario: 'tlopez', nombre: 'Tommy López' },
      '00000000-0000-0000-0000-000000000001',
    );
  });

  it('valida identidades estables y permite quitar una asignación', () => {
    expect(esquemaConsultaAsignaciones.safeParse({
      lineas: [{ idOrigen: 'R1:F1', identificadorDetalle: '1' }],
    }).success).toBe(true);
    expect(esquemaGuardarAsignacion.safeParse({
      idOrigen: 'R1:F1', identificadorDetalle: '1', usuarioAsignado: null,
    }).success).toBe(true);
    expect(esquemaGuardarAsignacion.safeParse({
      idOrigen: '', identificadorDetalle: '1', usuarioAsignado: 'gcruz',
    }).success).toBe(false);
  });
});
