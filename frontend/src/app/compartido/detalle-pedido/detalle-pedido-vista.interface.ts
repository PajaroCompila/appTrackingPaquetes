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
  soloConsulta: boolean;
  aviso?: string | null;
}

export interface DatoOperativoDetalle {
  etiqueta: string;
  valor: string | number | null | undefined;
  icono: string;
  esFecha?: boolean;
}

export interface ArticuloDetalleVisual {
  clave: string;
  codigo: string | null;
  descripcion: string | null;
  cantidad: number | null;
  codigoAlmacen: string | null;
  nombreAlmacen?: string | null;
  numeroPartida?: string | null;
  estadoEntrega?: string | null;
  fechaDespacho?: string | null;
  usuario?: string | null;
}

export interface PedidoDetalleVisual {
  numeroPedido: string | null;
  vendedor: string | null;
  fechaPedido: string | null;
  bodega: string | null;
  sucursal?: string | null;
  datosOperativos: DatoOperativoDetalle[];
  articulos: ArticuloDetalleVisual[];
}

export interface ErrorDetalleVisual {
  titulo: string;
  detalle: string;
  idSeguimiento?: string;
}
