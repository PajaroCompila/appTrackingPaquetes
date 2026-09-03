export interface FiltrosDashboard {
  fechaDesde: string;
  fechaHasta: string;
  codigoTienda?: string;
}

export interface ResumenTienda {
  codigoTienda: string | null;
  nombreTienda: string | null;
  pendientes: number;
  validados: number;
  disponible: boolean;
}

export interface TiendaDashboard {
  codigoTienda: string;
  nombreTienda: string;
}

export interface RespuestaDashboard {
  fechaDesde: string;
  fechaHasta: string;
  totales: { pendientes: number; validados: number };
  porTienda: ResumenTienda[];
  tiendas: TiendaDashboard[];
  consultadoEn: string;
}

export interface FiltrosVentasVendedor {
  codigoSucursal: string;
  fechaDesde: string;
  fechaHasta: string;
}

export interface VentaPorVendedor {
  codigoVendedor: string | null;
  nombreVendedor: string;
  ventasValidadas: number;
}

export interface RespuestaVentasVendedor {
  codigoSucursal: string;
  codigoTienda: string;
  nombreSucursal: string;
  fechaDesde: string;
  fechaHasta: string;
  totales: { ventasValidadas: number; vendedoresConVentas: number; promedioVentasPorVendedor: number };
  porVendedor: VentaPorVendedor[];
  consultadoEn: string;
}

export interface FiltrosDetalleVentasVendedor extends FiltrosVentasVendedor {
  codigoVendedor?: string;
  pagina: number;
  cantidadPorPagina: number;
}

export interface FacturaPedidoVendedor {
  numeroPedido: string;
  numeroFactura: string | null;
  montoTotal: number | null;
  moneda: string | null;
}

export interface RespuestaDetalleVentasVendedor {
  codigoSucursal: string;
  codigoTienda: string;
  nombreSucursal: string;
  codigoVendedor: string | null;
  fechaDesde: string;
  fechaHasta: string;
  pagina: number;
  cantidadPorPagina: number;
  totalPedidos: number;
  hayMas: boolean;
  ventas: FacturaPedidoVendedor[];
}
