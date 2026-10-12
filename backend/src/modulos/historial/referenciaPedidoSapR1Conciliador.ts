import sql from 'mssql';
import { consultarSap } from '../../infraestructura/sql/consultaSap.js';
import type { PedidoHistorial } from './historial.interface.js';
import {
  ReferenciaPedidoSapR1Repositorio,
  aplicarReferenciaSapR1,
  type ReferenciaPedidoSapR1,
} from './referenciaPedidoSapR1Repositorio.js';

interface DocumentoSapR1 {
  folioPedido: string;
  sapDocEntry: number;
  numeroPedidoSap: string;
}

export interface ResultadoConciliacionSapR1 {
  registros: PedidoHistorial[];
  relacionados: number;
  nuevos: number;
  ambiguos: string[];
  sapDisponible: boolean;
}

type ConsultarDocumentosSap = (folios: string[]) => Promise<DocumentoSapR1[]>;

const cantidadLoteSap = 500;

async function consultarDocumentosSap(folios: string[]): Promise<DocumentoSapR1[]> {
  const resultados: DocumentoSapR1[] = [];
  for (let inicio = 0; inicio < folios.length; inicio += cantidadLoteSap) {
    const lote = folios.slice(inicio, inicio + cantidadLoteSap);
    const parametros = lote.map((_, indice) => `@folio${indice}`);
    const consulta = `SELECT LTRIM(RTRIM(CONVERT(nvarchar(100),pedido.U_SO1_01FOLIORETAIL1))) folioPedido,
      pedido.DocEntry sapDocEntry,CONVERT(nvarchar(100),pedido.DocNum) numeroPedidoSap
      FROM dbo.ORDR pedido
      WHERE NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(100),pedido.U_SO1_01FOLIORETAIL1))),'') IS NOT NULL
        AND LTRIM(RTRIM(CONVERT(nvarchar(100),pedido.U_SO1_01FOLIORETAIL1))) IN (${parametros.join(',')})`;
    const resultado = await consultarSap<DocumentoSapR1>(consulta,
      (solicitud) => {
        lote.forEach((folio, indice) => solicitud.input(`folio${indice}`, sql.NVarChar(100), folio));
        return solicitud;
      });
    resultados.push(...resultado.recordset);
  }
  return resultados;
}

export function resolverReferenciasSapR1(
  pedidos: PedidoHistorial[],
  documentos: DocumentoSapR1[],
): { referencias: ReferenciaPedidoSapR1[]; ambiguos: string[] } {
  const pedidosPorFolio = new Map<string, PedidoHistorial[]>();
  for (const pedido of pedidos) {
    const folio = pedido.folioPedido.trim();
    if (!folio || pedido.origenPedido !== 'R1') continue;
    pedidosPorFolio.set(folio, [...(pedidosPorFolio.get(folio) ?? []), pedido]);
  }
  const documentosPorFolio = new Map<string, DocumentoSapR1[]>();
  for (const documento of documentos) {
    const folio = documento.folioPedido?.trim();
    if (!folio || !Number.isInteger(Number(documento.sapDocEntry)) || !String(documento.numeroPedidoSap).trim()) continue;
    const clave = `${documento.sapDocEntry}\u0000${String(documento.numeroPedidoSap).trim()}`;
    const actuales = documentosPorFolio.get(folio) ?? [];
    if (!actuales.some((actual) => `${actual.sapDocEntry}\u0000${actual.numeroPedidoSap}` === clave)) {
      documentosPorFolio.set(folio, [...actuales, documento]);
    }
  }
  const ambiguos = new Set<string>();
  const candidatos: ReferenciaPedidoSapR1[] = [];
  for (const [folio, pedidosFolio] of pedidosPorFolio) {
    const documentosFolio = documentosPorFolio.get(folio) ?? [];
    if (pedidosFolio.length !== 1 || documentosFolio.length > 1) {
      if (documentosFolio.length > 0) ambiguos.add(folio);
      continue;
    }
    if (documentosFolio.length === 0) continue;
    const pedido = pedidosFolio[0]!;
    const documento = documentosFolio[0]!;
    const codigoSucursal = pedido.idOrigen.split(':')[1]?.trim();
    if (!codigoSucursal) { ambiguos.add(folio); continue; }
    candidatos.push({ idOrigen: pedido.idOrigen, codigoSucursal, folioPedido: folio,
      sapDocEntry: Number(documento.sapDocEntry), numeroPedidoSap: String(documento.numeroPedidoSap).trim() });
  }
  const porDocumento = new Map<string, ReferenciaPedidoSapR1[]>();
  for (const candidato of candidatos) {
    const clave = `${candidato.sapDocEntry}\u0000${candidato.numeroPedidoSap}`;
    porDocumento.set(clave, [...(porDocumento.get(clave) ?? []), candidato]);
  }
  const referencias = candidatos.filter((candidato) => {
    const clave = `${candidato.sapDocEntry}\u0000${candidato.numeroPedidoSap}`;
    const univoca = (porDocumento.get(clave)?.length ?? 0) === 1;
    if (!univoca) ambiguos.add(candidato.folioPedido);
    return univoca;
  });
  return { referencias, ambiguos: [...ambiguos].sort() };
}

export class ReferenciaPedidoSapR1Conciliador {
  public constructor(
    private readonly repositorio = new ReferenciaPedidoSapR1Repositorio(),
    private readonly consultar: ConsultarDocumentosSap = consultarDocumentosSap,
  ) {}

  public async conciliar(pedidos: PedidoHistorial[]): Promise<ResultadoConciliacionSapR1> {
    const candidatos = pedidos.filter(({ origenPedido, folioPedido }) =>
      origenPedido === 'R1' && Boolean(folioPedido.trim()));
    const existentes = await this.repositorio.obtener(candidatos.map(({ idOrigen }) => idOrigen));
    const pendientes = candidatos.filter(({ idOrigen }) => !existentes.has(idOrigen));
    let nuevas: ReferenciaPedidoSapR1[] = [];
    let ambiguos: string[] = [];
    let sapDisponible = true;
    if (pendientes.length > 0) {
      try {
        const documentos = await this.consultar([...new Set(pendientes.map(({ folioPedido }) => folioPedido.trim()))]);
        ({ referencias: nuevas, ambiguos } = resolverReferenciasSapR1(pendientes, documentos));
        const conflictosPersistidos = await this.repositorio.guardar(nuevas);
        if (conflictosPersistidos.length > 0) {
          const conflictos = new Set(conflictosPersistidos);
          nuevas = nuevas.filter(({ folioPedido }) => !conflictos.has(folioPedido));
          ambiguos = [...new Set([...ambiguos, ...conflictosPersistidos])].sort();
        }
        nuevas.forEach((referencia) => existentes.set(referencia.idOrigen, referencia));
      } catch {
        sapDisponible = false;
        console.error('No fue posible conciliar los números SAP; se conservan las referencias locales.');
      }
    }
    const registros = pedidos.map((pedido) =>
      aplicarReferenciaSapR1(pedido, existentes.get(pedido.idOrigen)));
    return { registros, relacionados: existentes.size, nuevos: nuevas.length, ambiguos, sapDisponible };
  }
}
