import { describe, expect, it } from 'vitest';
import { esquemaEditarUsuario, esquemaListadoUsuarios, rolesPermitidos } from './usuarioValidacion.js';

describe('roles de usuario', () => {
  it.each(rolesPermitidos)('acepta cambiar el rol a %s', codigoRol => {
    expect(esquemaEditarUsuario.parse({ nombreCompleto: 'Marketing', nombreUsuario: 'mkt1',
      correo: '', codigoRol }).codigoRol).toBe(codigoRol);
    expect(esquemaListadoUsuarios.parse({ rol: codigoRol }).rol).toBe(codigoRol);
  });
  it('rechaza campos de contraseña o estado en la edición', () => {
    expect(esquemaEditarUsuario.safeParse({ nombreCompleto: 'Marketing', nombreUsuario: 'mkt1',
      codigoRol: 'DASHBOARDS', contrasena: '', activo: true }).success).toBe(false);
  });
});
