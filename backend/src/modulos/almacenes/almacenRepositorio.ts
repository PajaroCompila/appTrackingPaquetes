import sql from 'mssql';
import { consultarSistemaOrigen } from '../../infraestructura/sql/consultaSistemaOrigen.js';
import { obtenerPoolSistemaOrigen } from '../../infraestructura/sql/conexionSistemaOrigen.js';
import type { Almacen } from './almacen.interface.js';

export interface IAlmacenRepositorio {
  obtenerAlmacenes(): Promise<Almacen[]>;
}

export class AlmacenRepositorio implements IAlmacenRepositorio {
  public constructor(
    private readonly proveedorPool: () => sql.ConnectionPool = obtenerPoolSistemaOrigen,
  ) {}

  public async obtenerAlmacenes(): Promise<Almacen[]> {
    const resultado = await consultarSistemaOrigen<Almacen>(`
        SELECT TOP (@cantidadMaxima)
          almacenSucursal.[U_SO1_CODIGOALMACEN] AS codigoAlmacen,
          almacenSucursal.[U_SO1_NOMBREALMACEN] AS nombreAlmacen,
          almacenSucursal.[U_SO1_CODIGOPADRE] AS codigoSucursal,
          sucursal.[Name] AS nombreSucursal
        FROM [dbo].[@SO1_01SUCURSALALMA] AS almacenSucursal
        INNER JOIN [dbo].[@SO1_01SUCURSAL] AS sucursal
          ON sucursal.[Code] = almacenSucursal.[U_SO1_CODIGOPADRE]
        WHERE almacenSucursal.[U_SO1_NOMBREALMACEN] NOT LIKE @patronTransito
          AND almacenSucursal.[U_SO1_CODIGOALMACEN] <> @codigoAlmacenExcluido
        ORDER BY almacenSucursal.[U_SO1_CODIGOALMACEN];
      `, (solicitud) => solicitud
        .input('cantidadMaxima', sql.Int, 5000)
        .input('patronTransito', sql.NVarChar(50), '%Transito%')
        .input('codigoAlmacenExcluido', sql.NVarChar(16), 'BSPS06'), this.proveedorPool);

    return resultado.recordset;
  }
}
