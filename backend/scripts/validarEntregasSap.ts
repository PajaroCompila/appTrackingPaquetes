import 'dotenv/config';
import assert from 'node:assert/strict';
import { EntregaSapFuente } from '../src/modulos/historial/entregaSapFuente.js';
import { EntregaSapRepositorio } from '../src/modulos/historial/entregaSapRepositorio.js';
import { identidadEntregaSap } from '../src/modulos/historial/entregaSap.interface.js';
import { inicializarConexionPedidosBodega, obtenerPoolPedidosBodega, cerrarConexionPedidosBodega } from '../src/infraestructura/sql/conexionPedidosBodega.js';
import { cerrarConexionSap } from '../src/infraestructura/sql/conexionSap.js';

// Validación explícita de tres casos autorizados. SAP solo SELECT; persistencia solo PedidosBodega.
await inicializarConexionPedidosBodega();
try {
  const inicio = performance.now();
  const fuente = new EntregaSapFuente();
  const entregas = await fuente.obtener([6669,6618,4432]);
  const lecturaSapMs = Math.round(performance.now()-inicio);
  assert.equal(entregas.length,3);
  const principal = entregas.find(e => e.docEntry === 6669)!;
  assert.equal(principal.estadoFinanciero,'Entregado, Sin factura');
  assert.equal(principal.docStatus,'O');
  assert.equal(principal.estadoLogistico,'SALIDA_COMPROBADA');
  assert.equal(principal.usuarioRegistrador,'PIERROT');
  assert.equal(principal.lineas.length,2);
  assert.ok(principal.lineas.every(l => l.baseType === 23 && l.baseEntry === 160052));
  assert.ok(principal.lineas.every(l => l.cantidadEntregada === 1));
  assert.ok(!principal.lineas.some(l => l.baseType === 17 && l.baseEntry === 961461));
  const facturada = entregas.find(e => e.docEntry === 6618)!;
  assert.equal(facturada.estadoFinanciero,'Facturado');
  assert.ok(facturada.facturas.some(f => f.docEntry === 881777 && f.docNum === '201646148'));
  assert.equal(facturada.lineas.length,5);
  const sinBase = entregas.find(e => e.docEntry === 4432)!;
  assert.ok(sinBase.lineas.every(l => l.baseType === -1 && l.baseEntry === null));
  const repo = new EntregaSapRepositorio();
  await repo.guardar(entregas); await repo.guardar(entregas);
  const inicioLocal = performance.now();
  const admin = await repo.obtener(identidadEntregaSap(6669),'ADMINISTRADOR');
  const operador = await repo.obtener(identidadEntregaSap(6669),'OPERADOR_BODEGA');
  const consulta = await repo.obtener(identidadEntregaSap(6669),'CONSULTA');
  assert.equal(admin?.auditoriaSap?.usuarioRegistrador,'PIERROT');
  assert.ok(!JSON.stringify(operador).match(/PIERROT|usuarioRegistrador|nombreRegistrador|userSign/));
  assert.ok(!JSON.stringify(consulta).match(/PIERROT|usuarioRegistrador|nombreRegistrador|userSign/));
  const filtros = { fechaDesde:'2026-09-14', fechaHasta:'2026-09-14', codigosAlmacen:[],
    pagina:1, cantidadPorPagina:25, numeroPedido:'40968', clasificacion:'normal' as const };
  const documentos = await repo.buscar(filtros);
  const articulos = await repo.buscarArticulos(filtros);
  assert.equal(documentos.totalRegistros,1); assert.equal(articulos.totalRegistros,2);
  const filtrada = await repo.buscarArticulos({...filtros,codigosAlmacen:['BSPS03']});
  assert.equal(filtrada.totalRegistros,1); assert.equal(filtrada.registros[0]?.codigoArticulo,'YAM-PA150');
  const segunda = await repo.buscarArticulos({...filtros,cantidadPorPagina:1,pagina:2});
  assert.equal(segunda.totalRegistros,2); assert.equal(segunda.registros.length,1);
  assert.equal(segunda.registros[0]?.codigoArticulo,'YAM-PA150');
  const vacia = await repo.buscarArticulos({...filtros,cantidadPorPagina:1,pagina:3});
  assert.equal(vacia.totalRegistros,2); assert.equal(vacia.registros.length,0);
  const lecturaLocalMs = Math.round(performance.now()-inicioLocal);
  const conteo = await obtenerPoolPedidosBodega().request().query<{ docEntry:number; cantidad:number }>(`
    SELECT docEntry,COUNT(*) cantidad FROM dbo.EntregaSapHistorial WHERE docEntry IN(6669,6618,4432) GROUP BY docEntry
  `);
  assert.ok(conteo.recordset.every(f => f.cantidad === 1));
  console.info(JSON.stringify({ lecturaSapMs, lecturaLocalMs, casos:entregas.map(e => ({
    id:e.idOrigen,documento:e.docNum,estado:e.estadoFinanciero,lineas:e.lineas.length,
    salida:e.estadoLogistico,facturas:[...new Set(e.facturas.map(f => f.docNum))],
  })), auditoriaAdmin:admin?.auditoriaSap, auditoriaOperador:false, auditoriaConsulta:false,
    documentosPrincipal:documentos.totalRegistros, articulosPrincipal:articulos.totalRegistros,
    idempotencia:true, paginacion:true, aislamientoAlmacenes:true },null,2));
} finally { await Promise.allSettled([cerrarConexionPedidosBodega(),cerrarConexionSap()]); }
