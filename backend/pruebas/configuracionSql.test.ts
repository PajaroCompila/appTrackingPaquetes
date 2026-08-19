import { describe, expect, it } from 'vitest';
import { obtenerConfiguracionSql } from '../src/configuracion/configuracionSql.js';

describe('configuración SQL de SistemaOrigen', () => {
  it('transforma variables válidas sin alterar la contraseña', () => {
    const configuracionSql = obtenerConfiguracionSql({
      SQL_SERVIDOR: 'servidor-pruebas',
      SQL_PUERTO: '1433',
      SQL_BASE_DATOS: 'sistemaOrigen_pruebas',
      SQL_USUARIO: 'lector_pruebas',
      SQL_CONTRASENA: 'valor-solo-para-prueba',
    });

    expect(configuracionSql).toMatchObject({
      servidor: 'servidor-pruebas',
      puerto: 1433,
      baseDatos: 'sistemaOrigen_pruebas',
      usuario: 'lector_pruebas',
      contrasena: 'valor-solo-para-prueba',
      tiempoMaximoConsultaMs: 10000,
      poolMinimo: 0,
      poolMaximo: 5,
    });
  });

  it('rechaza una configuración incompleta sin revelar sus valores', () => {
    expect(() => obtenerConfiguracionSql({})).toThrow(
      'La configuración SQL de SistemaOrigen no es válida o está incompleta.',
    );
  });
});
