export interface ExistenciaArticuloAlmacen {
  codigoAlmacen: string;
  nombreAlmacen: string;
  existenciaFisica: number;
}

export interface InventarioArticulo {
  codigoArticulo: string;
  descripcion: string;
  codigoAlmacen: string;
  nombreAlmacen: string;
  existenciaFisica: number;
  existencias: ExistenciaArticuloAlmacen[];
}
