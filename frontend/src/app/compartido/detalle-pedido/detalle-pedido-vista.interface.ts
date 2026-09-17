export type SeveridadDetalle = 'exito' | 'advertencia' | 'informacion' | 'peligro';

export interface ConfiguracionDetallePedido {
  contexto: string;
  titulo: string;
  descripcion: string;
  etiquetaEstado: string;
  severidadEstado: SeveridadDetalle;
  etiquetaRetorno: string;
  tituloInformacion: string;
  etiquetaArticulos: string;
  aviso?: string | null;
  permitirImpresion?: boolean;
  herramientasImpresionPendiente?: boolean;
}

export interface DatoOperativoDetalle {
  etiqueta: string;
  valor: string | number | null | undefined;
  icono: string;
  esFecha?: boolean;
}

export interface ArticuloDetalleVisual {
  clave: string;
  identificadorDetalle?: string | null;
  codigo: string | null;
  descripcion: string | null;
  cantidad: number | null;
  codigoAlmacen: string | null;
  nombreAlmacen?: string | null;
  numeroPartida?: string | null;
  estadoEntrega?: string | null;
  fechaDespacho?: string | null;
  usuario?: string | null;
  responsable?: string | null;
  operacionPermitida?: boolean;
}

export interface ModificacionPedidoVisual {
  tipo: 'AGREGADO' | 'ELIMINADO' | 'CANTIDAD' | 'BODEGA';
  identificadorDetalle: string;
  codigoArticulo: string | null;
  descripcion: string | null;
  cantidadAnterior: number | null;
  cantidadNueva: number | null;
  codigoAlmacenAnterior: string | null;
  codigoAlmacenNuevo: string | null;
  detectadoEn: string;
  modificadoPor: string | null;
}

export interface PedidoDetalleVisual {
  tipoDocumento?: string;
  auditoriaSap?: {
    usuarioRegistrador: string | null;
    nombreRegistrador: string | null;
    documentoEntrega: string;
    fechaEntrega: string;
  };
  idOrigen: string;
  numeroPedido: string | null;
  vendedor: string | null;
  fechaPedido: string | null;
  bodega: string | null;
  sucursal?: string | null;
  datosOperativos: DatoOperativoDetalle[];
  articulos: ArticuloDetalleVisual[];
  modificaciones?: ModificacionPedidoVisual[];
}

export interface ErrorDetalleVisual {
  titulo: string;
  detalle: string;
  idSeguimiento?: string;
}
