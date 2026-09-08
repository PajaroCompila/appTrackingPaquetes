import { describe, expect, it } from 'vitest';
import {
  esquemaConsultaAsignaciones,
  esquemaGuardarAsignacion,
  puedeAsignarPedidos,
  tecnicosAsignables,
} from './asignacionRutas.js';

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
