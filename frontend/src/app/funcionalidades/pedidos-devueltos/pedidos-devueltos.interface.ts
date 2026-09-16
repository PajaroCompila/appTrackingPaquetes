export type EstadoDevolucion = 'PENDIENTE DE DEVOLUCIÓN' | 'DEVOLUCIÓN PARCIAL' | 'DEVUELTO';
export interface LineaDevolucion {
  identificadorDetalle: string; codigoArticulo: string | null; descripcion: string | null;
  cantidad: number; codigoAlmacen: string | null; estado: EstadoDevolucion;
  cantidadRecibida?: number; recibidoPor?: string | null; recibidoEn?: string | null;
}
export interface PedidoDevuelto {
  idOrigen: string; idClave: string; origenPedido?: 'R1' | 'SAP'; folioPedido?: string | null;
  numeroPedido: string; nombreVendedor?: string | null; fechaDespacho?: string | null;
  fechaCancelacion?: string | null; motivo?: string | null; canceladoPor?: string | null;
  estado: EstadoDevolucion; totalLineas?: number; lineasRecibidas?: number;
  fechaDevolucionCompleta?: string | null; lineas: LineaDevolucion[];
}
export interface FiltrosPedidosDevueltos {
  numeroPedido: string; fechaDesde: string; fechaHasta: string; codigosAlmacen: string[];
  estado: 'todos' | 'pendiente' | 'parcial' | 'devuelto';
  cantidadPorPagina: number; pagina: number; vista: 'pedido' | 'articulos';
}
export interface SeleccionDevolucion { idClave: string; identificadorDetalle: string }
