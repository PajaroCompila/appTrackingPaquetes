export interface PedidoResumen {
  idOrigen: string;
  origenPedido: 'R1' | 'SAP';
  creadoEnR1: boolean;
  sapDocEntry: string | null;
  folioPedido: string;
  numeroPedido: string;
  codigoVenta: string | null;
  codigoVendedor: number | null;
  nombreVendedor: string | null;
  codigosAlmacen: string[];
  nombresBodega: string | null;
  fechaHoraPedido: string | null;
  codigoEstadoVenta: string | null;
  codigoSincronizacion: string | null;
  articulos: ArticuloPedidoResumen[];
}

export interface ArticuloPedidoResumen {
  identificadorDetalle?: string | null;
  transferidoEn?: string | null;
  usuarioTransferencia?: string | null;
  codigoArticulo: string | null;
  descripcion: string | null;
  cantidad: number | null;
  codigoAlmacen: string | null;
  nombreAlmacen: string | null;
}

export interface PartidaPedido {
  numeroPartida: string | null;
  codigoArticulo: string | null;
  descripcionArticulo: string | null;
  cantidadSolicitada: number | null;
  codigoAlmacen: string | null;
  nombreAlmacen: string | null;
  codigoEstadoEntrega: string | null;
}

export interface DetallePedido {
  cabecera: PedidoResumen;
  partidas: PartidaPedido[];
}

export interface FiltrosPedidos {
  numeroPedido?: string;
  fechaDesde?: string;
  fechaHasta?: string;
  codigosAlmacen?: string[];
  codigoEstadoVenta?: string;
  codigoSincronizacion?: string;
  pagina: number;
  cantidadPorPagina: 25 | 50 | 100;
}

export interface RespuestaListaPedidos {
  datos: PedidoResumen[];
  paginacion: {
    pagina: number;
    cantidadPorPagina: number;
    cantidadDevuelta: number;
    totalRegistros?: number;
    hayMas: boolean;
  };
  fuentes?: { retailOne: 'disponible' | 'no_disponible'; sap: 'disponible' | 'no_disponible' };
}

export interface RespuestaDetallePedido {
  datos: DetallePedido;
}

export interface InventarioArticulo {
  codigoArticulo: string;
  descripcion: string;
  codigoAlmacen: string;
  nombreAlmacen: string;
  existenciaFisica: number;
  existencias: ExistenciaArticuloAlmacen[];
}

export interface ExistenciaArticuloAlmacen {
  codigoAlmacen: string;
  nombreAlmacen: string;
  existenciaFisica: number;
}
