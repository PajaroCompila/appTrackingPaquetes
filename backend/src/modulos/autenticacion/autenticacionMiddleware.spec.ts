import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { ErrorAplicacion } from '../../compartido/errores/errorAplicacion.js';
import { requerirRoles } from './autenticacionMiddleware.js';

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

  it.each(['OPERADOR_BODEGA', 'CONSULTA'])(
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
