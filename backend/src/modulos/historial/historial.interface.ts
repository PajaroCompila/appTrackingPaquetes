import type { PedidoResumen } from '../pedidos/pedido.interface.js';

export interface PedidoHistorial extends PedidoResumen {
  estadoLocal: 'VALIDADO' | 'DESPACHADO';
  despachadoEn: string | null;
  validadoDetectadoEn: string | null;
  usuarioDespacho: string | null;
}

export interface FiltrosHistorial {
  fechaDesde: string;
  fechaHasta: string;
  numeroPedido?: string;
  codigosAlmacen: string[];
  pagina: number;
  cantidadPorPagina: number;
}

export interface PaginaHistorial {
  registros: PedidoHistorial[];
  pagina: number;
  cantidadPorPagina: number;
  hayMas: boolean;
}
