import type { PedidoResumen } from '../pedidos/pedido.interface.js';
import type { AuditoriaEntregaSap, EntregaSapPublica, EstadoEntregaSap } from './entregaSap.interface.js';

export interface PedidoHistorial extends PedidoResumen {
  estadoHistorial?: EstadoEntregaSap;
  entregaSap?: EntregaSapPublica;
  auditoriaSap?: AuditoriaEntregaSap;
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
  clasificacion?: 'normal' | 'especial';
}

export interface PaginaHistorial {
  registros: PedidoHistorial[];
  pagina: number;
  cantidadPorPagina: number;
  totalRegistros: number;
  hayMas: boolean;
}

export interface ArticuloHistorial {
  estadoHistorial?: EstadoEntregaSap;
  entregaSap?: EntregaSapPublica;
  idOrigen: string;
  identificadorDetalle: string | null;
  numeroPedido: string;
  codigoArticulo: string | null;
  descripcion: string | null;
  cantidad: number | null;
  codigoAlmacen: string | null;
  nombreAlmacen: string | null;
  fechaHoraPedido: string | null;
  fechaEntradaCola?: string | null;
  despachadoEn?: string | null;
  nombreVendedor: string | null;
  usuarioAsignado?: string | null;
  esEspecial?: boolean;
  modificado?: boolean;
  modificadoPor?: string | null;
}

export interface PaginaArticulosHistorial {
  registros: ArticuloHistorial[];
  pagina: number;
  cantidadPorPagina: number;
  totalRegistros: number;
  hayMas: boolean;
}
