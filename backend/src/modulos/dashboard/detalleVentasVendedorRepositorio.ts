import sql from 'mssql';
import { ErrorAplicacion } from '../../compartido/errores/errorAplicacion.js';
import type { ConfiguracionSucursalR1 } from '../../configuracion/configuracionBaseDatos.js';
import { obtenerPoolSucursalR1, obtenerSucursalesR1 } from '../../infraestructura/sql/conexionSucursalesR1.js';
import { consultarSap } from '../../infraestructura/sql/consultaSap.js';
import { validarConsultaSistemaOrigen } from '../../infraestructura/sql/consultaSistemaOrigen.js';
import type {
  FacturaPedidoVendedor,
  FiltrosDetalleVentasVendedor,
  RespuestaDetalleVentasVendedor,
} from './dashboard.interface.js';

interface FilaPedidoR1 {
  numeroPedido: string | number;
  totalPedidos: string | number;
}

interface FilaFacturaSap {
  numeroPedido: string | number;
  numeroFactura: string | number | null;
  montoTotal: number | null;
  moneda: string | null;
}

type ConsultarPedidos = (
  sucursal: ConfiguracionSucursalR1,
  filtros: FiltrosDetalleVentasVendedor,
) => Promise<FilaPedidoR1[]>;

type ConsultarFacturas = (numerosPedido: string[]) => Promise<FilaFacturaSap[]>;

const codigoR1 = (sucursal: ConfiguracionSucursalR1): string =>
  sucursal.codigoTienda.startsWith('T') && sucursal.codigoTienda.endsWith('01')
    ? sucursal.codigoTienda.slice(1, -2)
    : sucursal.codigoTienda;

async function consultarPedidos(
  sucursal: ConfiguracionSucursalR1,
  filtros: FiltrosDetalleVentasVendedor,
): Promise<FilaPedidoR1[]> {
  const consulta = `SELECT
    CONVERT(nvarchar(30), venta.[U_SO1_DOCUMENTOSBO]) numeroPedido,
    COUNT_BIG(*) OVER() totalPedidos
    FROM [dbo].[@SO1_01VENTA] venta
    WHERE venta.[U_SO1_TIPO] = 'PE'
      AND venta.[U_SO1_VERIFICADO] = 'Y'
      AND venta.[U_SO1_SUCURSAL] = @codigoSucursalR1
      AND venta.[U_SO1_FECHA] >= @fechaDesde
      AND venta.[U_SO1_FECHA] < DATEADD(day, 1, @fechaHasta)
      AND venta.[U_SO1_DOCUMENTOSBO] IS NOT NULL
      AND venta.[U_SO1_DOCUMENTOSBO] > 0
      AND ((@codigoVendedor IS NULL AND venta.[U_SO1_VENDEDOR] IS NULL)
        OR CONVERT(nvarchar(20), venta.[U_SO1_VENDEDOR]) = @codigoVendedor)
    GROUP BY venta.[Name], venta.[U_SO1_DOCUMENTOSBO], venta.[U_SO1_FECHA]
    ORDER BY venta.[U_SO1_FECHA] DESC, venta.[Name] DESC
    OFFSET @desplazamiento ROWS FETCH NEXT @cantidadPorPagina ROWS ONLY;`;
  validarConsultaSistemaOrigen(consulta);
  const pool = await obtenerPoolSucursalR1(sucursal);
  const resultado = await pool.request()
    .input('codigoSucursalR1', sql.NVarChar(16), codigoR1(sucursal))
    .input('fechaDesde', sql.Date, filtros.fechaDesde)
    .input('fechaHasta', sql.Date, filtros.fechaHasta)
    .input('codigoVendedor', sql.NVarChar(20), filtros.codigoVendedor ?? null)
    .input('desplazamiento', sql.Int, (filtros.pagina - 1) * filtros.cantidadPorPagina)
    .input('cantidadPorPagina', sql.Int, filtros.cantidadPorPagina)
    .query<FilaPedidoR1>(consulta);
  return resultado.recordset;
}

async function consultarFacturas(numerosPedido: string[]): Promise<FilaFacturaSap[]> {
  if (numerosPedido.length === 0) return [];
  const parametros = numerosPedido.map((_, indice) => `@numeroPedido${indice}`);
  const consulta = `SELECT DISTINCT
    pedido.[DocNum] numeroPedido,
    factura.[DocNum] numeroFactura,
    factura.[DocTotal] montoTotal,
    factura.[DocCur] moneda
    FROM [dbo].[ORDR] pedido
    OUTER APPLY (
      SELECT DISTINCT encabezado.[DocNum], encabezado.[DocTotal], encabezado.[DocCur]
      FROM [dbo].[INV1] linea
      INNER JOIN [dbo].[OINV] encabezado ON encabezado.[DocEntry] = linea.[DocEntry]
      WHERE linea.[BaseType] = @tipoPedido
        AND linea.[BaseEntry] = pedido.[DocEntry]
        AND encabezado.[CANCELED] = @noCancelada
    ) factura
    WHERE pedido.[DocNum] IN (${parametros.join(', ')})
    ORDER BY pedido.[DocNum] DESC, factura.[DocNum] DESC;`;
  const resultado = await consultarSap<FilaFacturaSap>(consulta, (solicitud) => {
    solicitud.input('tipoPedido', sql.Int, 17).input('noCancelada', sql.Char(1), 'N');
    numerosPedido.forEach((numeroPedido, indice) => {
      solicitud.input(`numeroPedido${indice}`, sql.Int, Number(numeroPedido));
    });
    return solicitud;
  });
  return resultado.recordset;
}

export class DetalleVentasVendedorRepositorio {
  public constructor(
    private readonly sucursales: ConfiguracionSucursalR1[] = obtenerSucursalesR1(),
    private readonly obtenerPedidos: ConsultarPedidos = consultarPedidos,
    private readonly obtenerFacturas: ConsultarFacturas = consultarFacturas,
  ) {}

  public async obtener(filtros: FiltrosDetalleVentasVendedor): Promise<RespuestaDetalleVentasVendedor> {
    const sucursal = this.sucursales.find((item) => item.codigoTienda === filtros.codigoSucursal
      || codigoR1(item) === filtros.codigoSucursal);
    if (!sucursal) {
      throw new ErrorAplicacion(404, 'SUCURSAL_NO_ENCONTRADA', 'La sucursal solicitada no existe.');
    }

    let pedidos: FilaPedidoR1[];
    try {
      pedidos = await this.obtenerPedidos(sucursal, filtros);
    } catch {
      throw new ErrorAplicacion(503, 'SUCURSAL_NO_DISPONIBLE', 'La sucursal no está disponible temporalmente.');
    }

    const numerosPedido = [...new Set(pedidos.map((pedido) => String(pedido.numeroPedido).trim()).filter(Boolean))];
    let facturas: FilaFacturaSap[];
    try {
      facturas = await this.obtenerFacturas(numerosPedido);
    } catch {
      throw new ErrorAplicacion(503, 'FACTURAS_NO_DISPONIBLES', 'No fue posible consultar las facturas en este momento.');
    }

    const ventas: FacturaPedidoVendedor[] = numerosPedido.flatMap((numeroPedido) => {
      const encontradas = facturas.filter((factura) => String(factura.numeroPedido) === numeroPedido);
      if (encontradas.length === 0) {
        return [{ numeroPedido, numeroFactura: null, montoTotal: null, moneda: null }];
      }
      return encontradas.map((factura) => ({
        numeroPedido,
        numeroFactura: factura.numeroFactura == null ? null : String(factura.numeroFactura),
        montoTotal: factura.montoTotal == null ? null : Number(factura.montoTotal),
        moneda: factura.moneda?.trim() || null,
      }));
    });
    const totalPedidos = Number(pedidos[0]?.totalPedidos ?? 0);

    return {
      codigoSucursal: codigoR1(sucursal),
      codigoTienda: sucursal.codigoTienda,
      nombreSucursal: sucursal.nombreTienda,
      codigoVendedor: filtros.codigoVendedor ?? null,
      fechaDesde: filtros.fechaDesde,
      fechaHasta: filtros.fechaHasta,
      pagina: filtros.pagina,
      cantidadPorPagina: filtros.cantidadPorPagina,
      totalPedidos,
      hayMas: filtros.pagina * filtros.cantidadPorPagina < totalPedidos,
      ventas,
    };
  }
}
