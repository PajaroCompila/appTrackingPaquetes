import { describe, expect, it } from 'vitest';
import { MIGRACION_HISTORIAL_R1_SNAPSHOT } from './historialR1SnapshotMigracion.js';

describe('migración de la proyección local de Historial R1', () => {
  it('crea una proyección JSON indexada únicamente en PedidosBodega', () => {
    expect(MIGRACION_HISTORIAL_R1_SNAPSHOT).toContain("DB_NAME() <> N'PedidosBodega'");
    expect(MIGRACION_HISTORIAL_R1_SNAPSHOT).toContain('HistorialR1Snapshot');
    expect(MIGRACION_HISTORIAL_R1_SNAPSHOT).toContain('IX_HistorialR1Snapshot_fecha');
    expect(MIGRACION_HISTORIAL_R1_SNAPSHOT).toContain('ISJSON(datos)=1');
    expect(MIGRACION_HISTORIAL_R1_SNAPSHOT).not.toMatch(/\b(?:SO1_01VENTA|ORDR|OINV|ODLN)\b/);
  });
});
