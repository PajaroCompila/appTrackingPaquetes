import { describe, expect, it } from 'vitest';
import { MIGRACION_PERSONAL_ASIGNABLE } from './personalAsignableMigracion.js';

describe('migración del catálogo de personal asignable', () => {
  it('crea un catálogo local sin credenciales y conserva códigos históricos', () => {
    expect(MIGRACION_PERSONAL_ASIGNABLE).toContain('CREATE TABLE dbo.PersonalAsignable');
    expect(MIGRACION_PERSONAL_ASIGNABLE).toContain('codigoAsignacion');
    expect(MIGRACION_PERSONAL_ASIGNABLE).toContain('dbo.AsignacionArticuloPedido');
    expect(MIGRACION_PERSONAL_ASIGNABLE).toContain("N'acalix'");
    expect(MIGRACION_PERSONAL_ASIGNABLE).toContain("N'jlara'");
    expect(MIGRACION_PERSONAL_ASIGNABLE).not.toContain('hashContrasena');
    expect(MIGRACION_PERSONAL_ASIGNABLE).not.toContain('DELETE ');
    expect(MIGRACION_PERSONAL_ASIGNABLE).not.toContain('UPDATE dbo.AsignacionArticuloPedido');
  });
});
