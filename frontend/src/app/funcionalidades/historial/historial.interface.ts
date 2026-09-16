import type { PedidoResumen } from '../pedidos/pedido.interface';
import type { AuditoriaEntregaSap, EntregaSapPublica, EstadoEntregaSap } from './entrega-sap.interface';

export interface HistorialValidado extends PedidoResumen {
  estadoHistorial?: EstadoEntregaSap;
  entregaSap?: EntregaSapPublica;
  auditoriaSap?: AuditoriaEntregaSap;
  estadoLocal: 'VALIDADO' | 'DESPACHADO';
  despachadoEn: string | null;
  validadoDetectadoEn: string | null;
  usuarioDespacho: string | null;
}

export interface RespuestaHistorial {
  datos: HistorialValidado[];
  paginacion: {
    pagina: number;
    cantidadPorPagina: number;
    cantidadDevuelta: number;
    totalRegistros?: number;
    hayMas: boolean;
  };
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
  nombreVendedor: string | null;
  usuarioAsignado?: string | null;
  excluidoSla?: boolean;
  modificado?: boolean;
  modificadoPor?: string | null;
}

export interface RespuestaArticulosHistorial {
  datos: ArticuloHistorial[];
  paginacion: RespuestaHistorial['paginacion'];
}
