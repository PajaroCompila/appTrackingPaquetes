import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { ErrorAplicacion } from '../../compartido/errores/errorAplicacion.js';
import { requerirAccesoModulo, requerirRoles } from './autenticacionMiddleware.js';

const identidad = {
  usuarioId: '11111111-1111-4111-8111-111111111111',
  nombreUsuario: 'usuario', nombreVisible: 'Usuario', codigoAlmacen: null,
  sesionId: '22222222-2222-4222-8222-222222222222', debeCambiarContrasena: false,
};

describe('requerirRoles', () => {
  it('permite continuar al administrador', () => {
    const siguiente = vi.fn();
    const solicitud = { user: { ...identidad, codigoRol: 'ADMINISTRADOR' } } as unknown as Request;

    requerirRoles('ADMINISTRADOR')(
      solicitud, {} as Response, siguiente as NextFunction,
    );

    expect(siguiente).toHaveBeenCalledWith();
  });

  it.each(['OPERADOR_BODEGA', 'CONSULTA', 'DASHBOARDS', 'INVENTARIO'])(
    'rechaza con 403 al rol %s',
    (codigoRol) => {
      const siguiente = vi.fn();
      const solicitud = { user: { ...identidad, codigoRol } } as unknown as Request;

      requerirRoles('ADMINISTRADOR')(
        solicitud, {} as Response, siguiente as NextFunction,
      );

      const error = siguiente.mock.calls[0]?.[0];
      expect(error).toBeInstanceOf(ErrorAplicacion);
      expect(error).toMatchObject({ estadoHttp: 403, codigo: 'PERMISO_REQUERIDO' });
    },
  );
});

describe('acceso del rol INVENTARIO', () => {
  it.each(['GET', 'HEAD'])('permite consultar artículos con %s', (method) => {
    const siguiente = vi.fn();
    requerirAccesoModulo({ user: { ...identidad, codigoRol: 'INVENTARIO' }, baseUrl: '/api/articulos',
      method } as Request, {} as Response, siguiente);
    expect(siguiente).toHaveBeenCalledWith();
  });

  it.each([
    ['/api/pedidos', 'GET'],
    ['/api/historial-validados', 'GET'],
    ['/api/usuarios', 'GET'],
    ['/api/articulos', 'POST'],
  ])('bloquea %s con %s', (baseUrl, method) => {
    const siguiente = vi.fn();
    requerirAccesoModulo({ user: { ...identidad, codigoRol: 'INVENTARIO' }, baseUrl,
      method } as Request, {} as Response, siguiente);
    expect(siguiente.mock.calls[0]?.[0]).toMatchObject({ estadoHttp: 403, codigo: 'PERMISO_REQUERIDO' });
  });
});

describe('acceso del rol DASHBOARDS', () => {
  it.each(['/api/usuarios', '/api/usuarios/roles'])(
    'bloquea %s para DASHBOARDS', (baseUrl) => {
      const siguiente = vi.fn();
      requerirAccesoModulo({ user: { ...identidad, nombreUsuario: 'cualquier_usuario', codigoRol: 'DASHBOARDS' }, baseUrl, method: 'GET' } as Request, {} as Response, siguiente);
      expect(siguiente.mock.calls[0]?.[0]).toMatchObject({ estadoHttp: 403 });
    });
  it.each(['/api/dashboard', '/api/autenticacion', '/api/pedidos', '/api/almacenes', '/api/articulos', '/api/historial-validados', '/api/pedidos-despachados', '/api/pedidos-devueltos'])('permite %s', (baseUrl) => {
    const siguiente = vi.fn();
    requerirAccesoModulo({ user: { ...identidad, nombreUsuario: 'otro_usuario', codigoRol: 'DASHBOARDS' }, baseUrl, method: 'GET' } as Request, {} as Response, siguiente);
    expect(siguiente).toHaveBeenCalledWith();
  });
  it.each([
    ['/api/pedidos/asignaciones', '/consultar'],
    ['/api/impresiones', '/consultar'],
  ])('permite la consulta POST sin escritura %s%s', (baseUrl, path) => {
    const siguiente = vi.fn();
    requerirAccesoModulo({ user: { ...identidad, codigoRol: 'DASHBOARDS' }, baseUrl, path,
      method: 'POST' } as Request, {} as Response, siguiente);
    expect(siguiente).toHaveBeenCalledWith();
  });
  it.each([
    ['/api/pedidos/asignaciones', '/', 'PATCH'],
    ['/api/pedidos/asignaciones', '/reasignar', 'PATCH'],
    ['/api/pedidos-despachados', '/', 'POST'],
    ['/api/pedidos-devueltos', '/confirmar', 'POST'],
    ['/api/impresiones', '/registrar', 'POST'],
  ])('bloquea la operacion mutable %s%s', (baseUrl, path, method) => {
    const siguiente = vi.fn();
    requerirAccesoModulo({ user: { ...identidad, codigoRol: 'DASHBOARDS' }, baseUrl, path,
      method } as Request, {} as Response, siguiente);
    expect(siguiente.mock.calls[0]?.[0]).toMatchObject({ estadoHttp: 403 });
  });
});

it.each(['POST', 'PATCH', 'DELETE'])('DASHBOARDS no puede escribir con %s', method => {
  const siguiente = vi.fn();
  requerirAccesoModulo({ user: { ...identidad, codigoRol: 'DASHBOARDS' }, baseUrl: '/api/dashboard', method } as Request, {} as Response, siguiente);
  expect(siguiente.mock.calls[0]?.[0]).toMatchObject({ estadoHttp: 403 });
});
