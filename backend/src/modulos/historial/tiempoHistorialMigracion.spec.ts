import { describe, expect, it } from 'vitest';
import { MIGRACION_TIEMPO_HISTORIAL } from './tiempoHistorialMigracion.js';

describe('migracion de tiempo total de Historial', () => {
  it('persiste el primer ingreso y reutiliza timestamps historicos reales', () => {
    expect(MIGRACION_TIEMPO_HISTORIAL).toContain('HistorialIngresoPedido');
    expect(MIGRACION_TIEMPO_HISTORIAL).toContain('pedido.validadoDetectadoEn');
    expect(MIGRACION_TIEMPO_HISTORIAL).toContain('pedido.cerradoDetectadoEn');
    expect(MIGRACION_TIEMPO_HISTORIAL).toContain('pedido.creadoEn');
    expect(MIGRACION_TIEMPO_HISTORIAL).toContain('entrega.detectadoEn');
    expect(MIGRACION_TIEMPO_HISTORIAL).toContain('SYSUTCDATETIME()');
    expect(MIGRACION_TIEMPO_HISTORIAL).not.toContain('UpdateDate');
  });
});
