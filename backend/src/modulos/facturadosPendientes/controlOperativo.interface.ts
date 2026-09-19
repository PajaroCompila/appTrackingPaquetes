export type ModoControlAlmacen = 'MANUAL' | 'SIN_VALIDACION_MANUAL';
export interface ConfiguracionControlAlmacen {
  codigoAlmacen: string;
  modoControl: ModoControlAlmacen | null;
  requiereConfirmacionFisica: boolean;
  activo: boolean;
  responsableConfigurado: string | null;
}
export interface LineaControlOperativo {
  idOrigen: string;
  identificadorDetalle: string;
  codigoArticulo: string | null;
  descripcion: string | null;
  cantidad: number | null;
  codigoAlmacen: string | null;
  modoControl: ModoControlAlmacen | null;
  confirmado: boolean;
  responsable: string | null;
  usuarioAsignado: string | null;
  version: string;
  estadoOperativo: 'Pendiente de entrega' | 'Confirmado' | 'Sin validación manual' | 'Sin configuración';
}
export interface PedidoControlOperativo {
  idOrigen: string;
  numeroPedido: string;
  nombreVendedor: string | null;
  fechaHoraPedido: string | null;
  estadoFinanciero: 'Facturado';
  estadoOperativo: 'Entrega pendiente';
  totalArticulos: number;
  controladosManualmente: number;
  confirmados: number;
  pendientes: number;
  sinValidacionManual: number;
  sinConfiguracion: number;
  lineas: LineaControlOperativo[];
}
export interface FiltrosControlOperativo {
  numeroPedido?: string;
  fechaDesde?: string;
  fechaHasta?: string;
  codigosAlmacen: string[];
  pagina: number;
  cantidadPorPagina: number;
  vista: 'pedido' | 'articulos';
}
export interface SeleccionConfirmacionFisica {
  idOrigen: string;
  identificadorDetalle: string;
  version: string;
}
