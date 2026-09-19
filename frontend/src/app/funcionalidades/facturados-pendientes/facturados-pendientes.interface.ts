export interface LineaFacturadaPendiente {
  idOrigen:string;identificadorDetalle:string;codigoArticulo:string|null;descripcion:string|null;
  cantidad:number|null;codigoAlmacen:string|null;responsable:string|null;usuarioAsignado:string|null;version:string;
}
export interface FacturadoPendiente {
  idOrigen:string;numeroPedido:string;nombreVendedor:string|null;fechaHoraPedido:string|null;
  estadoFinanciero:'Facturado';estadoOperativo:'Entrega pendiente';totalArticulos:number;
  controladosManualmente:number;confirmados:number;pendientes:number;sinValidacionManual:number;sinConfiguracion:number;
  lineas:LineaFacturadaPendiente[];
}
export interface FiltrosFacturadosPendientes {
  numeroPedido:string;fechaDesde:string;fechaHasta:string;codigosAlmacen:string[];
  pagina:number;cantidadPorPagina:number;vista:'articulos'|'pedido';
}
export interface RespuestaFacturadosPendientes {
  datos:FacturadoPendiente[];paginacion:{pagina:number;cantidadPorPagina:number;totalRegistros:number;hayMas:boolean};
  almacenesSinConfiguracion:string[];
}
