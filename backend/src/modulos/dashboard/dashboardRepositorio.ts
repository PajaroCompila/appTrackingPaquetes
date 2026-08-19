import sql from 'mssql';
import type { ConfiguracionSucursalR1 } from '../../configuracion/configuracionBaseDatos.js';
import { obtenerPoolSucursalR1, obtenerSucursalesR1 } from '../../infraestructura/sql/conexionSucursalesR1.js';
import { validarConsultaSistemaOrigen } from '../../infraestructura/sql/consultaSistemaOrigen.js';
import type { FiltrosDashboard, ResumenTienda, TiendaDashboard } from './dashboard.interface.js';

interface FilaResumen { pendientes: string | number; validados: string | number }
type ConsultarSucursal = (sucursal: ConfiguracionSucursalR1, filtros: FiltrosDashboard) => Promise<FilaResumen>;

const consultaResumen = `
  SELECT
    COUNT_BIG(DISTINCT CASE
      WHEN ISNULL(venta.[U_SO1_VERIFICADO], 'N') <> 'Y'
        AND venta.[U_SO1_STATUS] = 'A'
        AND NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(20), venta.[U_SO1_DOCUMENTOSBO]))), '') IS NOT NULL
      THEN venta.[Name] END) AS pendientes,
    COUNT_BIG(DISTINCT CASE WHEN venta.[U_SO1_VERIFICADO] = 'Y' THEN venta.[Name] END) AS validados
  FROM [dbo].[@SO1_01VENTA] AS venta
  WHERE venta.[U_SO1_TIPO] = 'PE'
    AND venta.[U_SO1_FECHA] >= @fechaDesde
    AND venta.[U_SO1_FECHA] < DATEADD(day, 1, @fechaHasta)
`;

async function consultarResumenSucursal(sucursal: ConfiguracionSucursalR1, filtros: FiltrosDashboard): Promise<FilaResumen> {
  validarConsultaSistemaOrigen(consultaResumen);
  const pool = await obtenerPoolSucursalR1(sucursal);
  const resultado = await pool.request()
    .input('fechaDesde', sql.Date, filtros.fechaDesde)
    .input('fechaHasta', sql.Date, filtros.fechaHasta)
    .query<FilaResumen>(consultaResumen);
  return resultado.recordset[0] ?? { pendientes: 0, validados: 0 };
}

export interface IDashboardRepositorio {
  obtenerResumen(filtros: FiltrosDashboard): Promise<ResumenTienda[]>;
  obtenerTiendas(): Promise<TiendaDashboard[]>;
}

export class DashboardRepositorio implements IDashboardRepositorio {
  public constructor(
    private readonly sucursales: ConfiguracionSucursalR1[] = obtenerSucursalesR1(),
    private readonly consultarSucursal: ConsultarSucursal = consultarResumenSucursal,
  ) {}

  public async obtenerResumen(filtros: FiltrosDashboard): Promise<ResumenTienda[]> {
    const seleccionadas = filtros.codigoTienda
      ? this.sucursales.filter((sucursal) => sucursal.codigoTienda === filtros.codigoTienda)
      : this.sucursales;
    const resultados = await Promise.allSettled(
      seleccionadas.map((sucursal) => this.consultarSucursal(sucursal, filtros)),
    );
    return seleccionadas.map((sucursal, indice) => {
      const resultado = resultados[indice];
      if (!resultado || resultado.status === 'rejected') {
        return { codigoTienda: sucursal.codigoTienda, nombreTienda: sucursal.nombreTienda,
          pendientes: 0, validados: 0, disponible: false };
      }
      return { codigoTienda: sucursal.codigoTienda, nombreTienda: sucursal.nombreTienda,
        pendientes: Number(resultado.value.pendientes), validados: Number(resultado.value.validados),
        disponible: true };
    });
  }

  public async obtenerTiendas(): Promise<TiendaDashboard[]> {
    return this.sucursales.map(({ codigoTienda, nombreTienda }) => ({ codigoTienda, nombreTienda }));
  }
}
