import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CancelacionSapHistorial, convertirCancelaciones, CONSULTA_CANCELACIONES_SAP,
  CONSULTA_CANDIDATOS_DEVUELTOS_SAP, CONSULTA_CIERRES_DEVUELTOS_SAP,
  CONSULTA_HORA_SAP, MARGEN_CAMBIOS_TARDIOS_MS, MIGRACION_CANCELACIONES_SAP,
  type FilaCanceladaSap } from './cancelacionSapHistorial.js';
import type { consultarSap } from '../../infraestructura/sql/consultaSap.js';

const { query, begin, commit, rollback, entradas } = vi.hoisted(() => ({
  query: vi.fn(), begin: vi.fn(), commit: vi.fn(), rollback: vi.fn(),
  entradas: [] as { nombre: string; valor: unknown }[],
}));
vi.mock('../../infraestructura/sql/conexionPedidosBodega.js', () => {
  const solicitud = () => ({
    input: function(nombre: string, ...argumentos: unknown[]) {
      entradas.push({ nombre, valor: argumentos.at(-1) });
      return this;
    },
    query,
    batch: query,
  });
  return { obtenerPoolPedidosBodega: () => ({ request: solicitud,
    transaction: () => ({ begin, commit, rollback, request: solicitud }) }) };
});
const fila: FilaCanceladaSap = { docEntry:1,numeroPedido:'101471323',folioPedido:null,
  fechaPedido:new Date('2026-09-02T00:00:00Z'),horaPedido:919,canceled:'Y',docStatus:'C',nombreVendedor:'Vendedor',
  linea:0,codigoArticulo:'A',descripcion:'Articulo',cantidad:2,codigoAlmacen:'BSPS04' };
const filtros = {codigosAlmacen:[],estado:'todos' as const,vista:'pedido' as const,pagina:1,cantidadPorPagina:25};
const ahoraSap = new Date('2026-10-07T18:00:00.000Z');

function fuenteSap(opciones: {
  canceladas?: FilaCanceladaSap[];
  cerradas?: FilaCanceladaSap[];
  candidatos?: number[];
} = {}): typeof consultarSap {
  return vi.fn(async (consulta: string) => {
    if (consulta === CONSULTA_HORA_SAP) return { recordset: [{ ahoraSap }] };
    if (consulta === CONSULTA_CANDIDATOS_DEVUELTOS_SAP) {
      return { recordset: (opciones.candidatos ?? []).map(docEntry => ({ docEntry })) };
    }
    if (consulta.includes("o.CANCELED='N'")) return { recordset: opciones.cerradas ?? [] };
    if (consulta.includes("o.CANCELED='Y'")) return { recordset: opciones.canceladas ?? [] };
    return { recordset: [] };
  }) as unknown as typeof consultarSap;
}

beforeEach(() => {
  query.mockReset().mockResolvedValue({recordset:[]});
  begin.mockReset(); commit.mockReset(); rollback.mockReset(); entradas.length = 0;
});

describe('historial exclusivo de cancelaciones SAP', () => {
  it('incluye cerrados sin factura aunque exista entrega y excluye cualquier factura valida', () => {
    const cerrado = {...fila,canceled:'N',docStatus:'C',tieneEntrega:0,tieneFacturaDirecta:0,tieneFacturaViaEntrega:0};
    const pedidos = convertirCancelaciones([cerrado,
      {...cerrado,docEntry:2,tieneEntrega:1}, {...cerrado,docEntry:3,tieneFacturaDirecta:1},
      {...cerrado,docEntry:4,tieneFacturaViaEntrega:1},
      {...cerrado,docEntry:5,docStatus:'O'}, {...cerrado,docEntry:6,canceled:'C'}]);
    expect(pedidos).toHaveLength(2);
    expect(pedidos[0]).toMatchObject({estado:'CERRADO',fechaCancelacion:null,fueDespachado:false});
    expect(pedidos[1]).toMatchObject({estado:'CERRADO'});
    expect(pedidos[0]?.lineas[0]?.estado).toBe('CERRADO');
    expect(CONSULTA_CIERRES_DEVUELTOS_SAP).toContain("o.DocStatus='C'");
    expect(CONSULTA_CIERRES_DEVUELTOS_SAP).toContain('AND NOT EXISTS (SELECT 1 FROM dbo.INV1');
    expect(CONSULTA_CIERRES_DEVUELTOS_SAP).toContain('JOIN dbo.INV1 l ON l.BaseType=15');
  });
  it('excluye de Devueltos un cierre que R1 confirma como facturado', () => {
    const cerrado = {...fila,canceled:'N',docStatus:'C',tieneEntrega:0,tieneFacturaDirecta:0};
    expect(convertirCancelaciones([cerrado], new Set(['101471323']))).toEqual([]);
  });
  it('excluye tambien una cancelacion cuando existe factura valida', () => {
    expect(convertirCancelaciones([{...fila,tieneFacturaDirecta:1}])).toEqual([]);
    expect(convertirCancelaciones([{...fila,tieneFacturaViaEntrega:1}])).toEqual([]);
  });
  it('consulta cierres en ambas vistas y permite abrir el detalle', async () => {
    const p=convertirCancelaciones([{...fila,canceled:'N',tieneEntrega:0,tieneFacturaDirecta:0}])[0]!;
    query.mockImplementation(async(s:string)=>s.includes('SELECT snapshot')
      ? {recordset:[{snapshot:JSON.stringify(p)}]} : {recordset:[]});
    const repo=new CancelacionSapHistorial(fuenteSap());
    expect((await repo.listar(filtros)).datos[0]?.estado).toBe('CERRADO');
    expect((await repo.listar({...filtros,vista:'articulos'})).total).toBe(1);
    expect((await repo.obtener(p.idClave))?.estado).toBe('CERRADO');
  });
  it('oculta el despachado pendiente de recepción y muestra de forma persistente quién lo recibió', async () => {
    const p=convertirCancelaciones([{...fila,canceled:'N',tieneEntrega:0,tieneFacturaDirecta:0}])[0]!;
    query.mockImplementation(async(s:string)=>s.includes('SELECT h.snapshot')
      ? {recordset:[{snapshot:JSON.stringify(p),nombreRecibio:'Gregorio Cruz',
        recibidoEn:new Date('2026-10-05T15:00:00Z')}]} : {recordset:[]});
    const repo=new CancelacionSapHistorial(fuenteSap());
    const recibido=(await repo.listar(filtros)).datos[0]!;
    expect(recibido).toMatchObject({estado:'DEVUELTO',fueDespachado:true,
      recibidoPor:'Gregorio Cruz',lineasRecibidas:1});
    expect(recibido.lineas[0]).toMatchObject({estado:'DEVUELTO',recibidoPor:'Gregorio Cruz'});

    query.mockImplementation(async(s:string)=>s.includes('SELECT h.snapshot')
      ? {recordset:[]} : {recordset:[]});
    expect((await repo.listar(filtros)).datos).toEqual([]);
  });
  it('recupera de forma persistente la asignación a otro pedido sin receptor ficticio', async () => {
    const p=convertirCancelaciones([fila])[0]!;
    query.mockImplementation(async(s:string)=>s.includes('SELECT h.snapshot')
      ? {recordset:[{snapshot:JSON.stringify(p),tipoRecepcion:'ASIGNADO_OTRO_PEDIDO',
        nombreRecibio:null,recibidoEn:new Date('2026-10-05T15:00:00Z')}]} : {recordset:[]});
    const recibido=(await new CancelacionSapHistorial(fuenteSap()).listar(filtros)).datos[0]!;
    expect(recibido).toMatchObject({estado:'DEVUELTO',recibidoPor:'Asignado a otro pedido'});
    expect(recibido.lineas[0]).toMatchObject({recibidoPor:'Asignado a otro pedido'});
  });
  it('reconcilia cierres aunque SAP ya no devuelva ninguno y conserva el historial', async () => {
    const repo=new CancelacionSapHistorial(fuenteSap());
    await repo.sincronizar();
    const sql=query.mock.calls.map(([q])=>String(q)).join('\n');
    expect(sql).toContain('SET activo=0');
    expect(sql).not.toMatch(/DELETE|TRUNCATE/);
  });
  it('solo admite Y, no cerrados, abiertos ni documentos de cancelacion C', () => {
    const pedidos = convertirCancelaciones(['N','C','Y','CANCEL',''].map((canceled,i)=>
      ({...fila,docEntry:i,canceled,docStatus:'O'})));
    expect(pedidos).toHaveLength(1);
    expect(pedidos[0]?.estado).toBe('CANCEL');
    expect(CONSULTA_CANCELACIONES_SAP).toContain("WHERE o.CANCELED='Y'");
    expect(CONSULTA_CANCELACIONES_SAP).not.toContain("DocStatus='C'");
  });
  it('no exige despacho local ni inventa fecha de cancelacion o recepcion', () => {
    const p = convertirCancelaciones([fila])[0]!;
    expect(p.fechaHoraPedido).toBe('2026-09-02T15:19:00.000Z');
    expect(p.fechaCancelacion).toBeNull();
    expect(p.fechaDespacho).toBeNull();
    expect(p.fueDespachado).toBe(false);
    expect(p.lineas[0]?.estado).toBe('CANCEL');
    expect(p.lineas[0]?.recibidoEn).toBeUndefined();
  });
  it('agrupa por DocEntry, evita duplicados y conserva pedidos sin lineas', () => {
    const p = convertirCancelaciones([fila,fila,{...fila,linea:1},{...fila,docEntry:2,linea:null}]);
    expect(p).toHaveLength(2);expect(p[0]?.lineas).toHaveLength(2);expect(p[1]?.lineas).toHaveLength(0);
    expect(convertirCancelaciones([fila])[0]?.idClave).toBe(p[0]?.idClave);
  });
  it('conserva el historial si SAP esta fuera de linea', async () => {
    const p = convertirCancelaciones([fila])[0]!;
    query.mockImplementation(async (s:string) => s.includes('COUNT(*)') ? {recordset:[{cantidad:1}]}
      : s.includes('SELECT snapshot') ? {recordset:[{snapshot:JSON.stringify(p)}]} : {recordset:[]});
    const fuente = vi.fn().mockRejectedValue(new Error('SAP desconectado'));
    const r = await new CancelacionSapHistorial(fuente as typeof consultarSap).listar(filtros);
    expect(r.datos[0]?.numeroPedido).toBe('101471323');
    expect(query.mock.calls.every(([q])=>!/DELETE|TRUNCATE/.test(q))).toBe(true);
  });
  it('sirve el historial local sin esperar la actualización externa', async () => {
    const p = convertirCancelaciones([fila])[0]!;
    let liberar!: (valor:{recordset:FilaCanceladaSap[]})=>void;
    const externa = new Promise<{recordset:FilaCanceladaSap[]}>((resolver)=>{liberar=resolver;});
    query.mockImplementation(async (s:string) => s.includes('COUNT(*)') ? {recordset:[{cantidad:1}]}
      : s.includes('SELECT h.snapshot') ? {recordset:[{snapshot:JSON.stringify(p)}]} : {recordset:[]});
    const fuente = vi.fn().mockReturnValueOnce(externa).mockResolvedValue({recordset:[]});
    const repo = new CancelacionSapHistorial(fuente as typeof consultarSap,
      vi.fn().mockResolvedValue(new Set()));

    const resultado = await Promise.race([
      repo.listar(filtros),
      new Promise<never>((_,rechazar)=>setTimeout(()=>rechazar(new Error('bloqueada')),100)),
    ]);
    expect(resultado.datos[0]?.numeroPedido).toBe('101471323');
    expect(fuente).toHaveBeenCalledOnce();
    liberar({recordset:[{ahoraSap}] as unknown as FilaCanceladaSap[]});
    await repo.sincronizar();
  });
  it('filtra bodegas antes de paginar articulos y excluye cualquier snapshot no CANCEL', async () => {
    const p = convertirCancelaciones([fila,{...fila,linea:1,codigoAlmacen:'BSPS02'}])[0]!;
    query.mockImplementation(async(s:string)=> s.includes('SELECT snapshot') ? {recordset:[
      {snapshot:JSON.stringify(p)},{snapshot:JSON.stringify({...p,estado:'DEVUELTO'})}]} : {recordset:[]});
    const fuente = fuenteSap();
    const r = await new CancelacionSapHistorial(fuente as typeof consultarSap).listar({...filtros,codigosAlmacen:['BSPS02'],vista:'articulos'});
    expect(r.total).toBe(1);expect(r.datos[0]?.lineas[0]?.codigoAlmacen).toBe('BSPS02');
  });
  it('persiste con identidad unica y sin borrar snapshots anteriores', async () => {
    const fuente=fuenteSap({canceladas:[fila]});
    await new CancelacionSapHistorial(fuente as typeof consultarSap,
      vi.fn().mockResolvedValue(new Set())).sincronizar();
    const insercion=query.mock.calls.map(([q])=>String(q)).find(q=>q.includes('INSERT dbo.CancelacionSapHistorial'))!;
    expect(insercion).toContain('AND NOT EXISTS');expect(insercion).toContain('UPDLOCK,HOLDLOCK');
    expect(insercion).not.toMatch(/DELETE|TRUNCATE/);
    expect(query.mock.calls.map(([q])=>String(q)).join('\n')).toContain("estadoLocal='CERRADO'");
  });

  it('incluye el indice local de cobertura y no define indices en SAP o R1', () => {
    expect(MIGRACION_CANCELACIONES_SAP).toContain('IX_CierreSapDevueltos_activo_cobertura');
    expect(MIGRACION_CANCELACIONES_SAP).toContain('ON dbo.CierreSapDevueltos(activo,docEntry DESC)');
    expect(CONSULTA_CANDIDATOS_DEVUELTOS_SAP.trim().startsWith('SELECT')).toBe(true);
    expect(CONSULTA_CANDIDATOS_DEVUELTOS_SAP).not.toMatch(/CREATE\s+INDEX|ALTER\s+TABLE/i);
  });

  it('usa checkpoint con solapamiento, incluye cambios tardios y avanza al reloj de SAP', async () => {
    const ultimoCambioSap = new Date('2026-10-07T17:00:00.000Z');
    query.mockImplementation(async (consulta: string) => consulta.includes('SELECT ultimoCambioSap')
      ? { recordset: [{ ultimoCambioSap,
        ultimaReconciliacionCompletaEn: new Date('2026-10-07T12:00:00.000Z') }] }
      : { recordset: [] });
    const fuente = fuenteSap({ candidatos: [fila.docEntry, fila.docEntry], canceladas: [fila] });
    const repo = new CancelacionSapHistorial(fuente, vi.fn().mockResolvedValue(new Set()));

    await repo.sincronizar();

    const metricas = repo.obtenerUltimasMetricas();
    expect(metricas).toMatchObject({ modo: 'INCREMENTAL', documentosProcesados: 1,
      lineasProcesadas: 1, hastaCambio: ahoraSap.toISOString() });
    expect(metricas?.desdeCambio).toBe(
      new Date(ultimoCambioSap.getTime() - MARGEN_CAMBIOS_TARDIOS_MS).toISOString());
    expect(fuente).toHaveBeenCalledWith(CONSULTA_CANDIDATOS_DEVUELTOS_SAP, expect.any(Function));
    expect(fuente).toHaveBeenCalledWith(expect.stringContaining('o.DocEntry IN (@docEntry0)'), expect.any(Function));
    expect(CONSULTA_CANDIDATOS_DEVUELTOS_SAP).toContain('dbo.ORDR');
    expect(CONSULTA_CANDIDATOS_DEVUELTOS_SAP).toContain('dbo.OINV');
    expect(CONSULTA_CANDIDATOS_DEVUELTOS_SAP).toContain('dbo.ODLN');
    expect(entradas).toContainEqual({ nombre: 'hastaCambio', valor: ahoraSap });
    expect(query.mock.calls.map(([consulta]) => String(consulta)).join('\n'))
      .toContain('UPDATE dbo.ControlSincronizacionDevueltos');
    expect(commit).toHaveBeenCalledOnce();
  });

  it('no avanza el checkpoint al fallar y permite reintentar de forma idempotente', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-07T18:00:00.000Z'));
    let fallar = true;
    const fuente = vi.fn(async (consulta: string) => {
      if (consulta === CONSULTA_HORA_SAP) return { recordset: [{ ahoraSap }] };
      if (fallar) { fallar = false; throw new Error('SAP temporalmente fuera de linea'); }
      return { recordset: [] };
    }) as unknown as typeof consultarSap;
    const repo = new CancelacionSapHistorial(fuente, vi.fn().mockResolvedValue(new Set()));
    try {
      await expect(repo.sincronizar()).rejects.toThrow('SAP temporalmente fuera de linea');
      expect(commit).not.toHaveBeenCalled();
      expect(query.mock.calls.map(([consulta]) => String(consulta)).join('\n'))
        .not.toContain('UPDATE dbo.ControlSincronizacionDevueltos');

      vi.advanceTimersByTime(60_001);
      await repo.sincronizar();
      expect(commit).toHaveBeenCalledOnce();
      const persistencia = query.mock.calls.map(([consulta]) => String(consulta))
        .find(consulta => consulta.includes('INSERT dbo.CancelacionSapHistorial'))!;
      expect(persistencia).toContain('NOT EXISTS');
      expect(persistencia).toContain('UPDLOCK,HOLDLOCK');
    } finally {
      vi.useRealTimers();
    }
  });
});
