import { describe, expect, it } from 'vitest';
import { validarConsultaSistemaOrigen } from '../src/infraestructura/sql/consultaSistemaOrigen.js';

describe('barrera de consultas SistemaOrigen', () => {
  it('acepta una sola consulta SELECT', () => {
    expect(() => validarConsultaSistemaOrigen('SELECT TOP (1) [Name] FROM dbo.Tabla;')).not.toThrow();
  });

  it.each([
    'UPDATE dbo.Tabla SET valor = 1',
    'SELECT * INTO dbo.Copia FROM dbo.Tabla',
    'SELECT 1; DELETE FROM dbo.Tabla',
    'EXEC dbo.Procedimiento',
    'CREATE TABLE dbo.X (id int)',
    'SELECT 1 -- comentario',
  ])('rechaza la sentencia prohibida: %s', (consulta) => {
    expect(() => validarConsultaSistemaOrigen(consulta)).toThrow();
  });
});
