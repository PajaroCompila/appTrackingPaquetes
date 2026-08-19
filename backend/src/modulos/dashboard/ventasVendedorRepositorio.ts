import sql from 'mssql';
import { ErrorAplicacion } from '../../compartido/errores/errorAplicacion.js';
import type { ConfiguracionSucursalR1 } from '../../configuracion/configuracionBaseDatos.js';
import { obtenerPoolSucursalR1, obtenerSucursalesR1 } from '../../infraestructura/sql/conexionSucursalesR1.js';
import { validarConsultaSistemaOrigen } from '../../infraestructura/sql/consultaSistemaOrigen.js';
import type { FiltrosVentasVendedor, RespuestaVentasVendedor, VentaPorVendedor } from './dashboard.interface.js';

interface FilaVendedor { codigoVendedor: string | number | null; nombreVendedor: string | null; ventasValidadas: string | number }
type Consultar = (sucursal: ConfiguracionSucursalR1, filtros: FiltrosVentasVendedor) => Promise<FilaVendedor[]>;

const codigoR1 = (sucursal: ConfiguracionSucursalR1): string =>
  sucursal.codigoTienda.startsWith('T') && sucursal.codigoTienda.endsWith('01')
    ? sucursal.codigoTienda.slice(1, -2) : sucursal.codigoTienda;

async function consultarVentas(sucursal: ConfiguracionSucursalR1, filtros: FiltrosVentasVendedor): Promise<FilaVendedor[]> {
  const consulta = `SELECT CONVERT(nvarchar(20), venta.[U_SO1_VENDEDOR]) codigoVendedor,
    NULLIF(LTRIM(RTRIM(vendedor.[SlpName])), '') nombreVendedor,
    COUNT_BIG(DISTINCT venta.[Name]) ventasValidadas
    FROM [dbo].[@SO1_01VENTA] venta
    LEFT JOIN [dbo].[OSLP] vendedor ON vendedor.[SlpCode] = venta.[U_SO1_VENDEDOR]
    WHERE venta.[U_SO1_TIPO] = 'PE'
      AND venta.[U_SO1_VERIFICADO] = 'Y'
      AND venta.[U_SO1_SUCURSAL] = @codigoSucursalR1
      AND venta.[U_SO1_FECHA] >= @fechaDesde
      AND venta.[U_SO1_FECHA] < DATEADD(day, 1, @fechaHasta)
    GROUP BY venta.[U_SO1_VENDEDOR], vendedor.[SlpName]
    ORDER BY ventasValidadas DESC, nombreVendedor, codigoVendedor;`;
  validarConsultaSistemaOrigen(consulta);
  const pool = await obtenerPoolSucursalR1(sucursal);
  return (await pool.request().input('codigoSucursalR1', sql.NVarChar(16), codigoR1(sucursal))
    .input('fechaDesde', sql.Date, filtros.fechaDesde).input('fechaHasta', sql.Date, filtros.fechaHasta)
    .query<FilaVendedor>(consulta)).recordset;
}

export class VentasVendedorRepositorio {
  public constructor(
    private readonly sucursales: ConfiguracionSucursalR1[] = obtenerSucursalesR1(),
    private readonly consultar: Consultar = consultarVentas,
  ) {}

  public async obtener(filtros: FiltrosVentasVendedor): Promise<RespuestaVentasVendedor> {
    const sucursal = this.sucursales.find((item) => item.codigoTienda === filtros.codigoSucursal
      || codigoR1(item) === filtros.codigoSucursal);
    if (!sucursal) throw new ErrorAplicacion(404, 'SUCURSAL_NO_ENCONTRADA', 'La sucursal solicitada no existe.');
    let filas: FilaVendedor[];
    try { filas = await this.consultar(sucursal, filtros); } catch {
      throw new ErrorAplicacion(503, 'SUCURSAL_NO_DISPONIBLE', 'La sucursal no está disponible temporalmente.');
    }
    const porVendedor: VentaPorVendedor[] = filas.map((fila) => ({
      codigoVendedor: fila.codigoVendedor == null ? null : String(fila.codigoVendedor).trim() || null,
      nombreVendedor: fila.nombreVendedor?.trim() || 'Sin vendedor asignado',
      ventasValidadas: Number(fila.ventasValidadas),
    }));
    const ventasValidadas = porVendedor.reduce((total, vendedor) => total + vendedor.ventasValidadas, 0);
    const vendedoresConVentas = porVendedor.filter(({ codigoVendedor }) => codigoVendedor !== null).length;
    return { codigoSucursal: codigoR1(sucursal), codigoTienda: sucursal.codigoTienda,
      nombreSucursal: sucursal.nombreTienda, fechaDesde: filtros.fechaDesde, fechaHasta: filtros.fechaHasta,
      totales: { ventasValidadas, vendedoresConVentas,
        promedioVentasPorVendedor: vendedoresConVentas === 0 ? 0 : ventasValidadas / vendedoresConVentas },
      porVendedor, consultadoEn: new Date().toISOString() };
  }
}
