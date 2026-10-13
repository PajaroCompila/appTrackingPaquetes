import { describe, expect, it, vi } from 'vitest';
import type { PersonalAsignableRepositorio } from './personalAsignableRepositorio.js';
import { ambitosParaSesion, PersonalAsignableServicio } from './personalAsignableServicio.js';

const fechaCreacion = '2026-10-13T12:00:00.000Z';
const ana = { idPersonal: '1', codigoAsignacion: 'acalix', nombre: 'Ana', apellido: 'Calix',
  nombreCompleto: 'Ana Calix', ambito: 'ACALIX_JLARA' as const, activo: true, fechaCreacion };
const osmar = { idPersonal: '2', codigoAsignacion: 'omencia', nombre: 'Osmar', apellido: 'Mencia',
  nombreCompleto: 'Ósmar Mencia', ambito: 'GENERAL' as const, activo: true, fechaCreacion };

describe('catálogo de personal asignable', () => {
  it('conserva los ámbitos existentes y da al administrador acceso al catálogo completo', () => {
    expect(ambitosParaSesion({ codigoRol: 'ADMINISTRADOR', nombreUsuario: 'sistemas' }))
      .toEqual(['GENERAL', 'ACALIX_JLARA', 'TCIR01', 'TTBM01']);
    expect(ambitosParaSesion({ codigoRol: 'OPERADOR_BODEGA', nombreUsuario: 'tlopez' }))
      .toEqual(['TCIR01']);
    expect(ambitosParaSesion({ codigoRol: 'OPERADOR_BODEGA', nombreUsuario: 'bodegatbm' }))
      .toEqual(['TTBM01']);
    expect(ambitosParaSesion({ codigoRol: 'CONSULTA', nombreUsuario: 'otro' })).toEqual([]);
  });

  it('ordena por nombre visible con reglas de español y conserva los códigos históricos', async () => {
    const listarActivos = vi.fn().mockResolvedValue([osmar, ana]);
    const servicio = new PersonalAsignableServicio({ listarActivos } as unknown as PersonalAsignableRepositorio);
    await expect(servicio.listarParaSesion({ codigoRol: 'ADMINISTRADOR', nombreUsuario: 'sistemas' }))
      .resolves.toEqual([
        { usuario: 'acalix', nombre: 'Ana Calix' },
        { usuario: 'omencia', nombre: 'Ósmar Mencia' },
      ]);
  });

  it('rechaza códigos fuera del ámbito y traduce duplicados exactos', async () => {
    const obtenerActivo = vi.fn().mockResolvedValue(null);
    const crear = vi.fn().mockRejectedValue({ number: 2627 });
    const servicio = new PersonalAsignableServicio({ obtenerActivo, crear } as unknown as PersonalAsignableRepositorio);
    await expect(servicio.resolverParaSesion(
      { codigoRol: 'OPERADOR_BODEGA', nombreUsuario: 'gcruz' }, 'tlopez'))
      .rejects.toMatchObject({ codigo: 'TECNICO_NO_PERMITIDO' });
    await expect(servicio.crear({ nombre: 'Ana', apellido: 'Calix' }, 'usuario'))
      .rejects.toMatchObject({ codigo: 'PERSONAL_DUPLICADO' });
  });
});
