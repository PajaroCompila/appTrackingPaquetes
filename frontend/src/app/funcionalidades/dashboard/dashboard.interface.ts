export interface ResumenTiendaDashboard {
  codigoTienda: string | null;
  nombreTienda: string | null;
  pendientes: number;
  validados: number;
  disponible: boolean;
}

export interface TiendaDashboard { codigoTienda: string; nombreTienda: string }

export interface DashboardPedidos {
  fechaDesde: string;
  fechaHasta: string;
  totales: { pendientes: number; validados: number };
  porTienda: ResumenTiendaDashboard[];
  tiendas: TiendaDashboard[];
  consultadoEn: string;
}

export interface FiltrosDashboard {
  fechaDesde: string;
  fechaHasta: string;
  codigoTienda: string;
}

export interface VentaPorVendedor {
  codigoVendedor: string | null;
  nombreVendedor: string;
  ventasValidadas: number;
}

export interface VentasVendedorDashboard {
  codigoSucursal: string;
  codigoTienda: string;
  nombreSucursal: string;
  fechaDesde: string;
  fechaHasta: string;
  totales: { ventasValidadas: number; vendedoresConVentas: number; promedioVentasPorVendedor: number };
  porVendedor: VentaPorVendedor[];
  consultadoEn: string;
}

export interface FacturaPedidoVendedor {
  numeroPedido: string;
  numeroFactura: string | null;
  montoTotal: number | null;
  moneda: string | null;
}

export interface DetalleVentasVendedorDashboard {
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
