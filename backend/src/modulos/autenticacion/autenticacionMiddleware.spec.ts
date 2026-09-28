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

  it.each(['OPERADOR_BODEGA', 'CONSULTA', 'DASHBOARDS'])(
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
});

it.each(['POST', 'PATCH', 'DELETE'])('DASHBOARDS no puede escribir con %s', method => {
  const siguiente = vi.fn();
  requerirAccesoModulo({ user: { ...identidad, codigoRol: 'DASHBOARDS' }, baseUrl: '/api/dashboard', method } as Request, {} as Response, siguiente);
  expect(siguiente.mock.calls[0]?.[0]).toMatchObject({ estadoHttp: 403 });
});
