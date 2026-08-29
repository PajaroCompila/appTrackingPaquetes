import type { PedidoResumen } from '../pedidos/pedido.interface';

export interface HistorialValidado extends PedidoResumen {
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
    hayMas: boolean;
  };
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

export interface RespuestaArticulosHistorial {
  datos: ArticuloHistorial[];
  paginacion: RespuestaHistorial['paginacion'];
}
