import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { EntregaSapPersistida } from '../historial/entregaSap.interface.js';
import { construirEntregasSap, type FilaEntregaSap } from '../historial/entregaSapFuente.js';
import { proyectarEntregaSap } from '../historial/entregaSapRepositorio.js';
import { PedidoServicio } from './pedidoServicio.js';
import { firmaLineaR1 } from './firmaLineaR1.js';
import type { PedidoResumen } from './pedido.interface.js';
import { aplicarCoberturas, construirConciliaciones, ConciliacionEntregaPedido,
  type CandidatoEntregaR1, type CoberturaEntrega } from './conciliacionEntregaPedido.js';
import { validarConsultaSistemaOrigen } from '../../infraestructura/sql/consultaSistemaOrigen.js';
import { DespachoServicio } from '../despachos/despachoServicio.js';
import type { IDespachoRepositorio } from '../despachos/despachoRepositorio.js';
import type { LineaDespachoOrigenRepositorio } from '../despachos/lineaDespachoOrigenRepositorio.js';

const mocks = vi.hoisted(() => ({ local: vi.fn(), r1: vi.fn(), pool: vi.fn() }));
vi.mock('../../infraestructura/sql/conexionPedidosBodega.js', () => ({
  obtenerPoolPedidosBodega: () => ({ request: () => { const r = { input: () => r, query: mocks.local }; return r; } }),
}));
vi.mock('../../infraestructura/sql/conexionSucursalesR1.js', () => ({
  obtenerSucursalesR1: () => [{ codigoTienda: 'TSPS01' }], obtenerPoolSucursalR1: mocks.pool,
}));
vi.mock('../../infraestructura/sql/consultaSistemaOrigen.js', async importar => ({
  ...await importar<object>(), consultarSistemaOrigen: mocks.r1,
}));

const candidato = (cambios: Partial<CandidatoEntregaR1> = {}): CandidatoEntregaR1 => ({
  codigoFuente: 'TSPS01', folio: 'SPSS03PE390619', partida: 1, numeroPedido: '101475685',
  item: 'YAM-MODX7', almacen: 'TSPS01', cantidad: 1,
  folioBaseR1: 'SPSS04CO60265', partidaBaseR1: 1, tipoBaseR1: 'CO', lineaSapR1: 0,
  factorInventarioR1: 1, unidadInventarioR1: 'Manual', numeroCotizacion: '100206148',
  lineaCotizacionSap: 2, itemCotizacion: 'YAM-MODX7', almacenCotizacion: 'TSPS01',
  fechaPedido: '2026-09-14', ...cambios,
});
const fecha = new Date('2026-09-14T00:00:00Z');
function entrega(cantidad = 1): EntregaSapPersistida {
  const fila: FilaEntregaSap = { docEntry: 6669, docNum: 40968, docDate: fecha, docTime: 902,
    createDate: fecha, createTS: 90201, updateDate: fecha, updateTS: 90201, canceled: 'N', docStatus: 'O',
    nombreVendedor: 'SPS Hector Alvi Cedillo', referenciaR1: 'SPSS04CO60265', userSign: 55,
    usuarioRegistrador: 'PIERROT', nombreRegistrador: 'Pierrot', lineNum: 0, itemCode: 'YAM-MODX7',
    descripcion: 'Sintetizador', quantity: cantidad, invQty: cantidad, whsCode: 'TSPS01',
    nombreAlmacen: 'Tienda Principal', baseType: 23, baseEntry: 160052, baseLine: 2, numeroBase: 100206148,
    folioBaseR1: 'SPSS04CO60265', partidaBaseR1: 1, baseCreadaEnR1: 'Y', itemBase: 'YAM-MODX7',
    almacenBase: 'TSPS01', cantidadBase: 10, invQtyBase: 10 };
  return construirEntregasSap([fila],[{ docEntry:6669,lineNum:0,itemCode:'YAM-MODX7',whsCode:'TSPS01',salida:cantidad }],[])[0]!;
}
function pedido(c = candidato()): PedidoResumen {
  return { idOrigen:`R1:${c.codigoFuente}:${c.folio}`,origenPedido:'R1',creadoEnR1:true,sapDocEntry:null,
    folioPedido:c.folio,numeroPedido:c.numeroPedido,codigoVenta:null,codigoVendedor:null,
    nombreVendedor:'SPS Hector Alvi Cedillo',codigosAlmacen:[c.almacen],nombresBodega:'Tienda Principal',
    fechaHoraPedido:'2026-09-14T08:55:00',codigoEstadoVenta:'A',codigoSincronizacion:'N',
    articulos:[{ identificadorDetalle:String(c.partida),firmaConciliacion:firmaLineaR1(c,c.item,c.almacen,c.cantidad),
      codigoArticulo:c.item,descripcion:'Sintetizador',cantidad:c.cantidad,codigoAlmacen:c.almacen,nombreAlmacen:'Tienda Principal' }] };
}
const coberturas = (e = entrega(), c = candidato()): CoberturaEntrega[] => construirConciliaciones([e],[c]);
const servicio = (p: PedidoResumen[], cobertura: CoberturaEntrega[]) => new PedidoServicio({
  buscarPedidos: vi.fn().mockResolvedValue({ pedidos:p,pagina:1,cantidadPorPagina:25,totalRegistros:p.length,hayMas:false }),
  obtenerDetallePedido: vi.fn().mockResolvedValue(null),
}, { buscarPedidos:vi.fn().mockRejectedValue(new Error('SAP caído')),obtenerDetallePedido:vi.fn() },
undefined,undefined,{ aplicar:async p => aplicarCoberturas(p,cobertura) });

beforeEach(() => { vi.clearAllMocks(); mocks.pool.mockResolvedValue({}); mocks.local.mockResolvedValue({ recordset:[] }); });

describe('Conciliación estructurada de pendientes', () => {
  it('A: R1 sin entrega conserva la misma cantidad pendiente', async () => {
    const r = await servicio([pedido()],[]).buscarPedidos({pagina:1,cantidadPorPagina:25});
    expect(r.pedidos[0]?.articulos[0]?.cantidad).toBe(1);
  });
  it('B/F: 101475685 reconciliado desaparece sin una cabecera o página fantasma', async () => {
    const r = await servicio([pedido()],coberturas()).buscarPedidos({pagina:1,cantidadPorPagina:25});
    expect(r.pedidos).toEqual([]); expect(r.totalRegistros).toBe(0); expect(r.hayMas).toBe(false);
  });
  it('C: entrega 6 de 10 deja 4, sin modificar ni restar reiteradamente al cache R1', async () => {
    const c = candidato({cantidad:10}), p = pedido(c), s=servicio([p],coberturas(entrega(6),c));
    for(let i=0;i<2;i++) expect((await s.buscarPedidos({pagina:1,cantidadPorPagina:25})).pedidos[0]?.articulos[0]?.cantidad).toBe(4);
    expect(p.articulos[0]?.cantidad).toBe(10);
  });
  it('D: entrega 4432 sin base solo genera historial, no conciliaciones', () => {
    const e=entrega(); e.docEntry=4432;e.idOrigen='SAP:PAJARO_AZUL:15:4432';e.lineas[0]!.baseType=-1;
    expect(construirConciliaciones([e],[candidato()])).toEqual([]);
    expect(proyectarEntregaSap(e,fecha).entregaSap?.tipo).toBe('Entrega sin documento base');
  });
  it('E: mismo artículo, almacén y fecha con otro folio sigue pendiente', () => {
    const c=candidato({folio:'SPSS99PE999999'});
    expect(aplicarCoberturas([pedido(c)],coberturas())).toHaveLength(1);
    expect(construirConciliaciones([entrega()],[candidato({folioBaseR1:'SPSS00CO00000'})])).toEqual([]);
  });
  it('G: repetir conciliación no crea otra salida ni copia responsables', () => {
    const e=entrega(); const antes=proyectarEntregaSap(e,fecha);
    for(let i=0;i<3;i++) construirConciliaciones([e],[candidato()]);
    expect(proyectarEntregaSap(e,fecha)).toEqual(antes);
    expect(antes.idOrigen).toBe('SAP:PAJARO_AZUL:15:6669');expect(antes.responsablesAsignados).toEqual([]);
  });
  it('H: SAP caído no elimina un pedido por falta de respuesta', async () => {
    const r=await servicio([pedido()],[]).buscarPedidos({pagina:1,cantidadPorPagina:25});
    expect(r.pedidos).toHaveLength(1);expect(r.fuentes?.sap).toBe('no_disponible');
  });
  it('conserva evidencia local anterior cuando R1 falla, sin guardar un lote vacío', async () => {
    mocks.pool.mockRejectedValueOnce(new Error('Sucursal caída'));
    const c=new ConciliacionEntregaPedido(); const guardar=vi.spyOn(c,'guardar');
    await c.sincronizar([entrega()]);expect(guardar).not.toHaveBeenCalled();
  });
  it('un fallo local es fail-open para la lista y no borra pedidos', async () => {
    const s=servicio([pedido()],[]);
    const fallo=new PedidoServicio({ buscarPedidos:vi.fn().mockResolvedValue(await s.buscarPedidos({pagina:1,cantidadPorPagina:25})),obtenerDetallePedido:vi.fn() },
      {buscarPedidos:vi.fn().mockResolvedValue({pedidos:[],pagina:1,cantidadPorPagina:25,totalRegistros:0,hayMas:false}),obtenerDetallePedido:vi.fn()},
      undefined,undefined,{aplicar:vi.fn().mockRejectedValue(new Error('Local caída'))});
    expect((await fallo.buscarPedidos({pagina:1,cantidadPorPagina:25})).pedidos).toHaveLength(1);
  });
  it('no concilia bases ambiguas aunque solo uno de los pedidos coincida por artículo', () => {
    expect(construirConciliaciones([entrega()],[candidato(),candidato({folio:'SPSS00PE10000',item:'OTRO'})])).toEqual([]);
  });
  it.each(['canceled','sinSalida','almacen','partida','linea','numero','unidades'])('rechaza evidencia inválida: %s', caso => {
    const e=entrega(),c=candidato();
    if(caso==='canceled')e.canceled='Y';
    if(caso==='sinSalida')e.estadoLogistico='SIN_SALIDA';
    if(caso==='almacen')c.almacen='BSPS03';
    if(caso==='partida')c.partidaBaseR1=2;
    if(caso==='linea')c.lineaCotizacionSap=3;
    if(caso==='numero')c.numeroCotizacion='100206149';
    if(caso==='unidades')c.factorInventarioR1=12;
    expect(construirConciliaciones([e],[c])).toEqual([]);
  });
  it('una modificación de cantidad o referencia invalida la firma anterior hasta revalidar', () => {
    expect(aplicarCoberturas([pedido(candidato({cantidad:2}))],coberturas())[0]?.articulos[0]?.cantidad).toBe(2);
    expect(aplicarCoberturas([pedido(candidato({folioBaseR1:'OTRA'}))],coberturas())).toHaveLength(1);
  });
  it('concilia un pedido base17 solo con folio, DocNum, partida R1 y LineNum exactos', () => {
    const e=entrega();Object.assign(e.lineas[0]!,{baseType:17,baseEntry:961461,baseLine:0,
      numeroBase:'101475685',folioBaseR1:'SPSS03PE390619'});
    expect(construirConciliaciones([e],[candidato()])).toHaveLength(1);
    expect(construirConciliaciones([e],[candidato({lineaSapR1:1})])).toEqual([]);
  });
  it('nunca descuenta dos veces OpenQty de pedidos SAP directos', () => {
    const p=pedido();p.origenPedido='SAP';
    expect(aplicarCoberturas([p],coberturas())[0]?.articulos[0]?.cantidad).toBe(1);
  });
  it('resta entregas múltiples por partida y conserva la partida no cubierta', () => {
    const c=candidato({cantidad:10}),p=pedido(c),e=entrega(3),e2=entrega(3);
    e2.idOrigen='SAP:PAJARO_AZUL:15:6670';e2.docEntry=6670;
    p.articulos.push({...p.articulos[0]!,identificadorDetalle:'2'});
    const r=aplicarCoberturas([p],construirConciliaciones([e,e2],[c]));
    expect(r[0]?.articulos.map(a=>a.cantidad)).toEqual([4,10]);
  });
  it('R1 se consulta con SELECT y parámetros normales, compatible con nivel110, nunca OPENJSON', async () => {
    mocks.r1.mockImplementation(async texto => {validarConsultaSistemaOrigen(texto);return {recordset:[candidato()]};});
    const c=new ConciliacionEntregaPedido(),guardar=vi.spyOn(c,'guardar').mockResolvedValue();
    await c.sincronizar([entrega()]);
    expect(mocks.r1.mock.calls[0]?.[0]).not.toContain('OPENJSON');
    expect(mocks.r1.mock.calls[0]?.[0]).not.toMatch(/VERIFICADO|STATUS.*<>'C'/);
    expect(guardar).toHaveBeenCalledWith(['SAP:PAJARO_AZUL:15:6669'],'TSPS01',expect.arrayContaining([expect.objectContaining({partida:'1'})]));
  });
  it('la petición lee únicamente evidencia local filtrada por ids y entrega válida', async () => {
    mocks.local.mockResolvedValue({recordset:coberturas()});
    expect(await new ConciliacionEntregaPedido().aplicar([pedido()])).toEqual([]);
    const q=mocks.local.mock.calls[0]?.[0];expect(q).toContain("h.estadoLogistico='SALIDA_COMPROBADA'");
    expect(q).not.toMatch(/\b(?:ODLN|OIVL|ORDR|UPDATE|DELETE|INSERT)\b/);expect(mocks.r1).not.toHaveBeenCalled();
  });
  it('traslado guarda solo el resto parcial; una selección entregada se rechaza sin guardar', async () => {
    const c=candidato({cantidad:10}),p=pedido(c),a=p.articulos[0]!;
    const origen={obtenerLineas:vi.fn().mockResolvedValue([{idOrigen:p.idOrigen,identificadorDetalle:'1',pedido:p,articulo:a}])};
    const destino={identidadesLineas:vi.fn().mockResolvedValue(new Set()),guardarLineas:vi.fn().mockResolvedValue({transferidas:[]})};
    const s=new DespachoServicio(destino as unknown as IDespachoRepositorio,origen as unknown as LineaDespachoOrigenRepositorio,
      undefined,{aplicar:async p=>aplicarCoberturas(p,coberturas(entrega(6),c))});
    await s.transferir([{idOrigen:p.idOrigen,identificadorDetalle:'1'}],'usuario');
    expect(destino.guardarLineas.mock.calls[0]?.[0]?.[0]?.articulo.cantidad).toBe(4);
    const s2=new DespachoServicio(destino as unknown as IDespachoRepositorio,origen as unknown as LineaDespachoOrigenRepositorio,
      undefined,{aplicar:async p=>aplicarCoberturas(p,coberturas(entrega(10),c))});
    await expect(s2.transferir([{idOrigen:p.idOrigen,identificadorDetalle:'1'}],'usuario')).rejects.toMatchObject({codigo:'LINEA_NO_DISPONIBLE'});
    expect(destino.guardarLineas).toHaveBeenCalledTimes(1);
  });

  it('el detalle pendiente también muestra exclusivamente las cantidades restantes', async () => {
    const c=candidato({cantidad:10}),p=pedido(c),a=p.articulos[0]!;
    const s=new PedidoServicio({buscarPedidos:vi.fn(),obtenerDetallePedido:vi.fn().mockResolvedValue({cabecera:p,
      partidas:[{numeroPartida:'1',firmaConciliacion:a.firmaConciliacion,codigoArticulo:a.codigoArticulo,
        codigoAlmacen:a.codigoAlmacen,nombreAlmacen:a.nombreAlmacen,descripcionArticulo:a.descripcion,
        cantidadSolicitada:10,codigoEstadoEntrega:'A'}]})}, {buscarPedidos:vi.fn(),obtenerDetallePedido:vi.fn()},
      undefined,undefined,{aplicar:async p=>aplicarCoberturas(p,coberturas(entrega(6),c))});
    const detalle=await s.obtenerDetallePedido(p.idOrigen);
    expect(detalle.partidas[0]?.cantidadSolicitada).toBe(4);
    expect(detalle.cabecera.articulos[0]?.cantidad).toBe(4);
  });

  it('compensa las cabeceras retiradas antes de paginar para no saltar un pedido', async () => {
    const p=pedido(),otro=pedido(candidato({folio:'SPSS99PE999999'})),tercero=pedido(candidato({folio:'SPSS98PE999999'}));
    otro.fechaHoraPedido='2026-09-14T09:00:00';tercero.fechaHoraPedido='2026-09-14T10:00:00';
    const buscar=vi.fn(async filtros=>({pedidos:[p,otro,tercero].slice(0,filtros.cantidadPorPagina),
      pagina:1,cantidadPorPagina:filtros.cantidadPorPagina,totalRegistros:3,hayMas:filtros.cantidadPorPagina<3}));
    const s=new PedidoServicio({buscarPedidos:buscar,obtenerDetallePedido:vi.fn()},
      {buscarPedidos:vi.fn().mockResolvedValue({pedidos:[],pagina:1,cantidadPorPagina:25,totalRegistros:0,hayMas:false}),obtenerDetallePedido:vi.fn()},
      undefined,undefined,{cantidadACompensar:async()=>1,aplicar:async p=>aplicarCoberturas(p,coberturas())});
    const primera=await s.buscarPedidos({pagina:1,cantidadPorPagina:1,vista:'pedido'});
    const segunda=await s.buscarPedidos({pagina:2,cantidadPorPagina:1,vista:'pedido'});
    expect(primera.pedidos).toHaveLength(1);expect(segunda.pedidos).toHaveLength(1);
    expect(primera.pedidos[0]?.idOrigen).not.toBe(segunda.pedidos[0]?.idOrigen);
    expect(buscar.mock.calls.map(c=>c[0].cantidadPorPagina)).toEqual([2,3]);
    expect(segunda.hayMas).toBe(false);
  });
});
