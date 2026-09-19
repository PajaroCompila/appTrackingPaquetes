import { createHash } from 'node:crypto';
import type { LineaControlOperativo, PedidoControlOperativo } from './controlOperativo.interface.js';

export function versionLineaFisica(linea: Pick<LineaControlOperativo,
  'idOrigen' | 'identificadorDetalle' | 'codigoArticulo' | 'codigoAlmacen' | 'cantidad'>): string {
  return createHash('sha256').update(JSON.stringify([
    linea.idOrigen, linea.identificadorDetalle, linea.codigoArticulo,
    linea.codigoAlmacen, linea.cantidad,
  ])).digest('hex');
}

export function resumirControlOperativo(
  cabecera: Pick<PedidoControlOperativo, 'idOrigen' | 'numeroPedido' | 'nombreVendedor' | 'fechaHoraPedido'>,
  lineas: LineaControlOperativo[],
): PedidoControlOperativo | null {
  const manuales = lineas.filter(l => l.modoControl === 'MANUAL');
  const pendientes = manuales.filter(l => !l.confirmado);
  if (!pendientes.length) return null;
  return { ...cabecera, estadoFinanciero: 'Facturado', estadoOperativo: 'Entrega pendiente',
    totalArticulos: lineas.length, controladosManualmente: manuales.length,
    confirmados: manuales.length - pendientes.length, pendientes: pendientes.length,
    sinValidacionManual: lineas.filter(l => l.modoControl === 'SIN_VALIDACION_MANUAL').length,
    sinConfiguracion: lineas.filter(l => l.modoControl === null).length,
    lineas: pendientes,
  };
}
