export interface Almacen {
  codigoAlmacen: string;
  nombreAlmacen: string;
  codigoSucursal: string;
  nombreSucursal: string;
}

export interface RespuestaAlmacenes {
  datos: Almacen[];
}
