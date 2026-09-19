import sql from 'mssql';
import { obtenerPoolPedidosBodega } from '../../infraestructura/sql/conexionPedidosBodega.js';
import { obtenerPoolSucursalR1, obtenerSucursalesR1 } from '../../infraestructura/sql/conexionSucursalesR1.js';
import { validarConsultaSistemaOrigen } from '../../infraestructura/sql/consultaSistemaOrigen.js';
import { CONDICION_HISTORIAL_R1 } from '../historial/historialR1Repositorio.js';
import type { EstadoFinancieroControl } from './controlOperativoRepositorio.js';

export class ControlOperativoFinanciero {
  public async estados(ids: string[]): Promise<EstadoFinancieroControl[]> {
    if (!ids.length) return [];
    const locales=await obtenerPoolPedidosBodega().request().input('ids',sql.NVarChar(sql.MAX),JSON.stringify(ids))
      .query<{idOrigen:string; fuente:string; cabecera:string}>(`
        SELECT i.value idOrigen,p.cabecera,
          CASE WHEN EXISTS(SELECT 1 FROM dbo.EntregaSapHistorial h
            JOIN dbo.EntregaSapHistorialLinea l ON l.idOrigen=h.idOrigen
            WHERE h.estadoFinanciero=N'Facturado' AND h.estadoLogistico='SALIDA_COMPROBADA'
              AND JSON_VALUE(h.datos,'$.canceled')='N'
              AND ((l.baseType=17 AND i.value=CONCAT('SAP:',l.baseEntry))
                OR EXISTS(SELECT 1 FROM dbo.ConciliacionEntregaPedido c
                  WHERE c.idEntrega=l.idOrigen AND c.lineaEntrega=l.lineNum AND c.idPedido=i.value AND c.activa=1)))
            THEN 'HISTORIAL_ENTREGA_SAP' ELSE '' END fuente
        FROM OPENJSON(@ids) i JOIN dbo.ControlOperativoPedido p ON p.idOrigen=i.value;`);
    const estados=new Map<string,EstadoFinancieroControl>(ids.map(idOrigen=>
      [idOrigen,{idOrigen,facturado:null,fuente:null}]));
    for (const f of locales.recordset) if (f.idOrigen.startsWith('SAP:') || f.fuente) {
      estados.set(f.idOrigen,{idOrigen:f.idOrigen,facturado:Boolean(f.fuente),fuente:f.fuente || 'HISTORIAL_ENTREGA_SAP'});
    }
    const sucursales=obtenerSucursalesR1();
    const resultados=await Promise.allSettled(sucursales.map(async sucursal=> {
      const propios=ids.filter(id=>id.startsWith(`R1:${sucursal.codigoTienda}:`)
        || (sucursal.codigoTienda==='TSPS01' && /^R1:[^:]+$/.test(id)));
      if (!propios.length) return [];
      const folios=propios.map(id=>id.split(':').at(-1)!);
      const consulta=`SELECT venta.[Name] folio,CONVERT(nvarchar(100),venta.[U_SO1_DOCUMENTOSBO]) numeroPedido,
        vendedor.[SlpName] nombreVendedor,
        CASE WHEN venta.[U_SO1_FECHA] IS NULL OR venta.[U_SO1_HORA] IS NULL THEN NULL ELSE
          CONVERT(char(19),DATEADD(minute,(venta.[U_SO1_HORA]/100)*60+(venta.[U_SO1_HORA]%100),
            CONVERT(datetime2,CONVERT(date,venta.[U_SO1_FECHA]))),126) END fechaHoraPedido
        FROM dbo.[@SO1_01VENTA] venta LEFT JOIN dbo.OSLP vendedor ON vendedor.SlpCode=venta.[U_SO1_VENDEDOR]
        WHERE ${CONDICION_HISTORIAL_R1} AND venta.[Name] IN(SELECT value FROM OPENJSON(@folios));`;
      validarConsultaSistemaOrigen(consulta);
      const r=await (await obtenerPoolSucursalR1(sucursal)).request()
        .input('folios',sql.NVarChar(sql.MAX),JSON.stringify(folios)).query<{
          folio:string;numeroPedido:string;nombreVendedor:string|null;fechaHoraPedido:string|null}>(consulta);
      const verificadas=new Map<string,(typeof r.recordset)[number]>();
      const ambiguos=new Set<string>();
      for (const fila of r.recordset) {
        if (verificadas.has(fila.folio)) ambiguos.add(fila.folio);
        else verificadas.set(fila.folio,fila);
      }
      return propios.map(idOrigen=> {
        if (ambiguos.has(idOrigen.split(':').at(-1)!)) return {idOrigen,facturado:null,fuente:null};
        const fila=verificadas.get(idOrigen.split(':').at(-1)!);
        const previa=estados.get(idOrigen);
        return {idOrigen,facturado:Boolean(fila) || Boolean(previa?.facturado),
          fuente:fila ? 'HISTORIAL_R1_VERIFICADO' : previa?.fuente ?? 'HISTORIAL_R1_VERIFICADO',
          ...(fila ? {cabecera:{numeroPedido:fila.numeroPedido,nombreVendedor:fila.nombreVendedor,
            fechaHoraPedido:fila.fechaHoraPedido}} : {}),
        };
      });
    }));
    for (const resultado of resultados) {
      if (resultado.status==='fulfilled') for (const estado of resultado.value) estados.set(estado.idOrigen,estado);
      // Una sucursal caída no invalida el estado financiero conservado localmente.
    }
    return [...estados.values()];
  }
}
