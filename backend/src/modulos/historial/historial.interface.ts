import type { PedidoResumen } from '../pedidos/pedido.interface.js';

export interface PedidoHistorial extends PedidoResumen {
  estadoLocal: 'VALIDADO';
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

export interface ArticuloHistorial {
  idOrigen: string;
  identificadorDetalle: string | null;
  numeroPedido: string;
  codigoArticulo: string | null;
  descripcion: string | null;
  cantidad: number | null;
  codigoAlmacen: string | null;
  nombreAlmacen: string | null;
  fechaHoraPedido: string | null;
  nombreVendedor: string | null;
}

export interface PaginaArticulosHistorial {
  registros: ArticuloHistorial[];
  pagina: number;
  cantidadPorPagina: number;
  hayMas: boolean;
}
