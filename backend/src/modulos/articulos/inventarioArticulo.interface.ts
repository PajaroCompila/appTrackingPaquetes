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
  ultimaFechaIngreso: string | null;
  ultimaCantidadIngreso: number | null;
  existencias: ExistenciaArticuloAlmacen[];
}

export interface CoincidenciaInventarioArticulo {
  codigoArticulo: string;
  descripcion: string;
}
