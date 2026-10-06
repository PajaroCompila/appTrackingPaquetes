import { describe, expect, it } from 'vitest';
import { CONDICION_ETAPA_DESPACHADOS } from './despachoRepositorio.js';

describe('prioridad de etapas en Despachados', () => {
  it('conserva despachados y cierres pendientes, pero excluye estados terminales superiores', () => {
    expect(CONDICION_ETAPA_DESPACHADOS).toContain("estadoLocal IN ('DESPACHADO','CERRADO')");
    expect(CONDICION_ETAPA_DESPACHADOS).toContain('validadoDetectadoEn IS NULL');
    expect(CONDICION_ETAPA_DESPACHADOS).toContain('entregaDetectadaEn IS NULL');
    expect(CONDICION_ETAPA_DESPACHADOS).toContain('RecepcionDevolucionPedido');
    expect(CONDICION_ETAPA_DESPACHADOS).toContain("devolucion.estado=N'DEVUELTO'");
  });
});
