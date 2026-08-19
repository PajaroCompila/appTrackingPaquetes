import sql from 'mssql';
import { consultarSap } from '../../infraestructura/sql/consultaSap.js';
import { consultarSistemaOrigen } from '../../infraestructura/sql/consultaSistemaOrigen.js';
import { obtenerPoolSucursalR1, obtenerSucursalesR1 } from '../../infraestructura/sql/conexionSucursalesR1.js';
import type { ArticuloPedidoResumen, PedidoResumen } from '../pedidos/pedido.interface.js';

export interface IdentidadLineaDespacho {
  idOrigen: string;
  identificadorDetalle: string;
}

export interface LineaDespachoValidada extends IdentidadLineaDespacho {
  pedido: PedidoResumen;
  articulo: ArticuloPedidoResumen;
}

interface FilaLineaOrigen {
  idPedido: string | number;
  numeroPedido: string | number;
  identificadorDetalle: string | number;
  folioPedido: string | null;
  nombreVendedor: string | null;
  fechaHoraPedido: string | null;
  codigoArticulo: string | null;
  descripcion: string | null;
  cantidad: number | null;
  codigoAlmacen: string | null;
  nombreAlmacen: string | null;
}

const texto = (valor: string | null): string | null => valor?.trim() || null;

function agrupar(filas: FilaLineaOrigen[], origen: 'R1' | 'SAP', codigoFuente = ''): LineaDespachoValidada[] {
  return filas.map((fila) => {
    const clavePedido = String(fila.idPedido);
    const identificadorDetalle = String(fila.identificadorDetalle);
    const idOrigen = origen === 'R1' && codigoFuente
      ? `R1:${codigoFuente}:${clavePedido}` : `${origen}:${clavePedido}`;
    const articulo: ArticuloPedidoResumen = {
      identificadorDetalle,
      codigoArticulo: texto(fila.codigoArticulo),
      descripcion: texto(fila.descripcion),
      cantidad: fila.cantidad,
      codigoAlmacen: texto(fila.codigoAlmacen),
      nombreAlmacen: texto(fila.nombreAlmacen),
    };
    const pedido: PedidoResumen = {
      idOrigen,
      origenPedido: origen,
      creadoEnR1: origen === 'R1',
      sapDocEntry: origen === 'SAP' ? clavePedido : null,
      folioPedido: origen === 'R1' ? fila.folioPedido ?? clavePedido : `SAP:${clavePedido}`,
      numeroPedido: String(fila.numeroPedido),
      codigoVenta: null,
      codigoVendedor: null,
      nombreVendedor: texto(fila.nombreVendedor),
      codigosAlmacen: articulo.codigoAlmacen ? [articulo.codigoAlmacen] : [],
      nombresBodega: articulo.nombreAlmacen,
      fechaHoraPedido: fila.fechaHoraPedido,
      codigoEstadoVenta: 'A',
      codigoSincronizacion: null,
      articulos: [articulo],
    };
    return { idOrigen, identificadorDetalle, pedido, articulo };
  });
}

export class LineaDespachoOrigenRepositorio {
  public async obtenerLineas(identidades: IdentidadLineaDespacho[]): Promise<LineaDespachoValidada[]> {
    const retailOne = identidades.filter(({ idOrigen }) => idOrigen.startsWith('R1:'));
    const sap = identidades.filter(({ idOrigen }) => idOrigen.startsWith('SAP:'));
    const [lineasRetailOne, lineasSap] = await Promise.all([
      this.obtenerRetailOne(retailOne),
      this.obtenerSap(sap),
    ]);
    return [...lineasRetailOne, ...lineasSap];
  }

  private async obtenerRetailOne(identidades: IdentidadLineaDespacho[]): Promise<LineaDespachoValidada[]> {
    if (identidades.length === 0) return [];
    const sucursales = obtenerSucursalesR1();
    const grupos = new Map<string, IdentidadLineaDespacho[]>();
    for (const identidad of identidades) {
      const partes = identidad.idOrigen.split(':');
      const codigoFuente = partes.length >= 3 ? (partes[1] ?? 'TSPS01') : 'TSPS01';
      const folio = partes.length >= 3 ? partes.slice(2).join(':') : partes.slice(1).join(':');
      grupos.set(codigoFuente, [...(grupos.get(codigoFuente) ?? []),
        { ...identidad, idOrigen: `R1:${folio}` }]);
    }
    const resultados = await Promise.all([...grupos.entries()].map(async ([codigoFuente, lineas]) => {
      const sucursal = sucursales.find((item) => item.codigoTienda === codigoFuente);
      if (!sucursal) return [];
      const pool = await obtenerPoolSucursalR1(sucursal);
      return this.consultarLineasRetailOne(lineas, () => pool, codigoFuente);
    }));
    return resultados.flat();
  }

  private async consultarLineasRetailOne(
    identidades: IdentidadLineaDespacho[],
    proveedorPool: Parameters<typeof consultarSistemaOrigen>[2],
    codigoFuente: string,
  ): Promise<LineaDespachoValidada[]> {
    const condiciones = identidades.map((_, indice) =>
      `(venta.[Name] = @pedido${indice} AND detalle.[U_SO1_NUMPARTIDA] = @linea${indice})`);
    const resultado = await consultarSistemaOrigen<FilaLineaOrigen>(`
      SELECT venta.[Name] AS idPedido,
        CONVERT(nvarchar(20), venta.[U_SO1_DOCUMENTOSBO]) AS numeroPedido,
        detalle.[U_SO1_NUMPARTIDA] AS identificadorDetalle,
        venta.[Name] AS folioPedido,
        vendedor.[SlpName] AS nombreVendedor,
        CASE WHEN venta.[U_SO1_FECHA] IS NULL OR venta.[U_SO1_HORA] IS NULL THEN NULL ELSE
          CONVERT(char(19), DATEADD(minute, (venta.[U_SO1_HORA] / 100) * 60 +
          (venta.[U_SO1_HORA] % 100), CONVERT(datetime2, CONVERT(date, venta.[U_SO1_FECHA]))), 126)
        END AS fechaHoraPedido,
        detalle.[U_SO1_NUMEROARTICULO] AS codigoArticulo,
        detalle.[U_SO1_DESCRIPCION] AS descripcion,
        detalle.[U_SO1_CANTIDAD] AS cantidad,
        detalle.[U_SO1_ALMACEN] AS codigoAlmacen,
        almacen.[U_SO1_NOMBREALMACEN] AS nombreAlmacen
      FROM [dbo].[@SO1_01VENTA] venta
      INNER JOIN [dbo].[@SO1_01VENTADETALLE] detalle ON detalle.[U_SO1_FOLIO] = venta.[Name]
      LEFT JOIN [dbo].[OSLP] vendedor ON vendedor.[SlpCode] = venta.[U_SO1_VENDEDOR]
      LEFT JOIN [dbo].[@SO1_01SUCURSALALMA] almacen
        ON almacen.[U_SO1_CODIGOALMACEN] = detalle.[U_SO1_ALMACEN]
      WHERE venta.[U_SO1_STATUS] = 'A'
        AND venta.[U_SO1_TIPO] = 'PE'
        AND ISNULL(venta.[U_SO1_VERIFICADO], 'N') <> 'Y'
        AND NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(20), venta.[U_SO1_DOCUMENTOSBO]))), '') IS NOT NULL
        AND (${condiciones.join(' OR ')});
    `, (solicitud) => {
      identidades.forEach(({ idOrigen, identificadorDetalle }, indice) => {
        solicitud.input(`pedido${indice}`, sql.NVarChar(100), idOrigen.slice(3));
        solicitud.input(`linea${indice}`, sql.Int, Number(identificadorDetalle));
      });
      return solicitud;
    }, proveedorPool);
    return agrupar(resultado.recordset, 'R1', codigoFuente);
  }

  private async obtenerSap(identidades: IdentidadLineaDespacho[]): Promise<LineaDespachoValidada[]> {
    if (identidades.length === 0) return [];
    const condiciones = identidades.map((_, indice) =>
      `(pedido.[DocEntry] = @pedido${indice} AND detalle.[LineNum] = @linea${indice})`);
    const resultado = await consultarSap<FilaLineaOrigen>(`
      SELECT pedido.[DocEntry] AS idPedido, pedido.[DocNum] AS numeroPedido,
        detalle.[LineNum] AS identificadorDetalle, NULL AS folioPedido,
        vendedor.[SlpName] AS nombreVendedor,
        CONVERT(char(19), DATEADD(minute, (pedido.[DocTime] / 100) * 60 +
          (pedido.[DocTime] % 100), CONVERT(datetime2, CONVERT(date, pedido.[DocDate]))), 126)
          AS fechaHoraPedido,
        detalle.[ItemCode] AS codigoArticulo, detalle.[Dscription] AS descripcion,
        detalle.[OpenQty] AS cantidad, detalle.[WhsCode] AS codigoAlmacen,
        almacen.[WhsName] AS nombreAlmacen
      FROM [dbo].[ORDR] pedido
      INNER JOIN [dbo].[RDR1] detalle ON detalle.[DocEntry] = pedido.[DocEntry]
      INNER JOIN [dbo].[OCRD] cliente ON cliente.[CardCode] = pedido.[CardCode]
      LEFT JOIN [dbo].[OSLP] vendedor ON vendedor.[SlpCode] = pedido.[SlpCode]
      LEFT JOIN [dbo].[OWHS] almacen ON almacen.[WhsCode] = detalle.[WhsCode]
      WHERE pedido.[CANCELED] = 'N' AND pedido.[DocStatus] = 'O'
        AND pedido.[U_SO1_01RETAILONE] = 'N' AND cliente.[GroupCode] IN (103, 113)
        AND detalle.[LineStatus] = 'O' AND detalle.[OpenQty] > 0
        AND (${condiciones.join(' OR ')});
    `, (solicitud) => {
      identidades.forEach(({ idOrigen, identificadorDetalle }, indice) => {
        solicitud.input(`pedido${indice}`, sql.Int, Number(idOrigen.slice(4)));
        solicitud.input(`linea${indice}`, sql.Int, Number(identificadorDetalle));
      });
      return solicitud;
    });
    return agrupar(resultado.recordset, 'SAP');
  }
}
