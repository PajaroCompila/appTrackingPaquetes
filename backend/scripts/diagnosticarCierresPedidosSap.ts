import 'dotenv/config';
import sql from 'mssql';
import { cerrarConexionSap } from '../src/infraestructura/sql/conexionSap.js';
import { consultarSap } from '../src/infraestructura/sql/consultaSap.js';
import {
  clasificarCierreSap,
  columnasEvidenciaCierreSap,
} from '../src/modulos/historial/cierreSap.js';

interface FilaDiagnostico {
  docEntry: number;
  numeroPedido: number;
  estadoAnterior: string | null;
  estadoActual: string;
  tieneEntrega: number;
  tieneFacturaDirecta: number;
}

try {
  const cabeceras = await consultarSap<{ docEntry: number }>(`
    SELECT pedido.[DocEntry] AS docEntry
    FROM dbo.[ORDR] pedido
    WHERE pedido.[DocStatus] = 'C'
      AND pedido.[CANCELED] = 'N'
      AND pedido.[UpdateDate] >= CAST(GETDATE() AS date)
      AND pedido.[UpdateDate] < DATEADD(day, 1, CAST(GETDATE() AS date));
  `);
  const filas: FilaDiagnostico[] = [];
  const cantidadPorLote = 200;
  for (let inicio = 0; inicio < cabeceras.recordset.length; inicio += cantidadPorLote) {
    const lote = cabeceras.recordset.slice(inicio, inicio + cantidadPorLote);
    const parametros = lote.map((_, indice) => `@docEntry${indice}`);
    const resultado = await consultarSap<FilaDiagnostico>(`
      SELECT pedido.[DocEntry] AS docEntry, pedido.[DocNum] AS numeroPedido,
        ultimaVersion.[DocStatus] AS estadoAnterior,
        pedido.[DocStatus] AS estadoActual,
        ${columnasEvidenciaCierreSap('pedido')}
      FROM dbo.[ORDR] pedido
      OUTER APPLY (
        SELECT TOP (1) historico.[DocStatus]
        FROM dbo.[ADOC] historico
        WHERE historico.[ObjType] = '17'
          AND historico.[DocEntry] = pedido.[DocEntry]
        ORDER BY historico.[LogInstanc] DESC
      ) ultimaVersion
      WHERE pedido.[DocEntry] IN (${parametros.join(', ')})
      ORDER BY pedido.[DocNum] DESC;
    `, (solicitud) => {
      lote.forEach(({ docEntry }, indice) =>
        solicitud.input(`docEntry${indice}`, sql.Int, docEntry));
      return solicitud;
    });
    filas.push(...resultado.recordset);
  }

  console.table(filas.map((fila) => {
    const tieneEntrega = Boolean(fila.tieneEntrega);
    const tieneFacturaDirecta = Boolean(fila.tieneFacturaDirecta);
    return {
      DocEntry: fila.docEntry,
      Pedido: fila.numeroPedido,
      'Estado anterior': fila.estadoAnterior ?? 'NO DISPONIBLE EN ADOC',
      'Estado actual': fila.estadoActual,
      'Tiene entrega': tieneEntrega ? 'SI' : 'NO',
      'Tiene factura directa': tieneFacturaDirecta ? 'SI' : 'NO',
      'Tipo de cierre': clasificarCierreSap(tieneEntrega, tieneFacturaDirecta),
    };
  }));
} finally {
  await cerrarConexionSap();
}
