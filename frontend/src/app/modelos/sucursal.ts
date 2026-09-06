export interface Sucursal {
  sucursalId: number;
  nombre: string;
  codigo: string;
  direccion: string;
  departamentoCodigo: string;
  departamento: string;
  ciudadCodigo: string;
  ciudad: string;
  telefono: string;
  activo: boolean;
  fechaCreacion: string;
}

export interface Departamento { codigo: string; nombre: string; cabecera: string; }
export interface Ciudad { codigo: string; departamentoCodigo: string; nombre: string; }
export interface CatalogoUbicaciones { departamentos: Departamento[]; ciudades: Ciudad[]; }
export type DatosSucursal = Pick<Sucursal, 'nombre' | 'codigo' | 'direccion' | 'departamentoCodigo' | 'ciudadCodigo' | 'telefono'>;
