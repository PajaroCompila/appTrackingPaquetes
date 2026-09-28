import 'dotenv/config';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import express from 'express';
import request from 'supertest';
import { consultarSap } from '../src/infraestructura/sql/consultaSap.js';
import { cerrarConexionSap } from '../src/infraestructura/sql/conexionSap.js';
import { inicializarConexionPedidosBodega, cerrarConexionPedidosBodega, obtenerPoolPedidosBodega } from '../src/infraestructura/sql/conexionPedidosBodega.js';
import { CancelacionSapHistorial } from '../src/modulos/pedidosDevueltos/cancelacionSapHistorial.js';
import { crearPedidoDevueltoRutas } from '../src/modulos/pedidosDevueltos/pedidoDevueltoRutas.js';

await inicializarConexionPedidosBodega();
try {
  const repo = new CancelacionSapHistorial();
  await repo.sincronizar();
  const fuente = (await consultarSap<{docEntry:number;numeroPedido:string}>(
    "SELECT DocEntry docEntry,CONVERT(varchar(100),DocNum) numeroPedido FROM dbo.ORDR WHERE CANCELED='Y'"
  )).recordset;
  const locales = (await obtenerPoolPedidosBodega().request().query<{docEntry:number;canceled:string}>(
    'SELECT docEntry,canceled FROM dbo.CancelacionSapHistorial')).recordset;
  assert(locales.every(p => p.canceled === 'Y'));
  assert.equal(new Set(locales.map(p => p.docEntry)).size, locales.length);
  assert(fuente.every(p => locales.some(l => l.docEntry === p.docEntry)));
  await new CancelacionSapHistorial().sincronizar();
  assert.equal((await obtenerPoolPedidosBodega().request().query('SELECT COUNT(*) cantidad FROM dbo.CancelacionSapHistorial')).recordset[0].cantidad, locales.length);

  // API aislada para validar rutas con una identidad de prueba; no crea sesiones ni usuarios.
  const app = express();
  app.use((req,_res,next) => {
    req.user={usuarioId:'00000000-0000-4000-8000-000000000001',nombreUsuario:'validacion',nombreVisible:'Validacion',
      codigoRol:'CONSULTA',codigoAlmacen:null,codigosAlmacenVisibles:[],sesionId:'prueba',debeCambiarContrasena:false}; next();
  });
  app.use('/api/pedidos-devueltos',crearPedidoDevueltoRutas(repo));
  const casos = [];
  for (const [fecha,numeros] of [['2026-09-02',['101471323']],['2026-09-10',['700059230','700059235']]] as const) {
    const r=await request(app).get('/api/pedidos-devueltos').query({fechaDesde:fecha,fechaHasta:fecha});
    assert.equal(r.status,200);assert.equal(r.body.paginacion.totalRegistros,numeros.length);
    assert.deepEqual(r.body.datos.map((p:{numeroPedido:string})=>p.numeroPedido).sort(),[...numeros].sort());
    for(const p of r.body.datos) {
      assert.equal(p.estado,'CANCEL');assert.equal(p.fechaCancelacion,null);
      const detalle=await request(app).get('/api/pedidos-devueltos/'+p.idClave);
      assert.equal(detalle.status,200);assert.equal(detalle.body.datos.estado,'CANCEL');
    }
    const articulos=await request(app).get('/api/pedidos-devueltos').query({fechaDesde:fecha,fechaHasta:fecha,vista:'articulos',cantidadPorPagina:100});
    assert.equal(articulos.status,200);
    assert.equal(articulos.body.paginacion.totalRegistros,r.body.datos.reduce((n:number,p:{lineas:unknown[]})=>n+p.lineas.length,0));
    casos.push({fecha,pedidos:numeros,articulos:articulos.body.paginacion.totalRegistros});
  }
  const noCancelado = (await consultarSap<{numero:string}>("SELECT TOP 1 CONVERT(varchar(100),DocNum) numero FROM dbo.ORDR WHERE CANCELED='N' AND DocDate='20260910' ORDER BY DocEntry DESC")).recordset[0]!;
  const excluido=await request(app).get('/api/pedidos-devueltos').query({numeroPedido:noCancelado.numero});
  assert.equal(excluido.body.paginacion.totalRegistros,0);
  const sinSap=new CancelacionSapHistorial((async()=>{throw new Error('Prueba de SAP fuera de linea');}) as typeof consultarSap);
  const historico=await sinSap.listar({numeroPedido:'101471323',codigosAlmacen:[],estado:'todos',vista:'pedido',pagina:1,cantidadPorPagina:25});
  assert.equal(historico.datos[0]?.numeroPedido,'101471323');
  const resultado={validadoEn:new Date().toISOString(),fuente:'ORDR.CANCELED=Y',canceladosSap:fuente.length,
    historialLocal:locales.length,duplicados:0,casos,noCanceladoExcluido:noCancelado.numero,
    persistenciaSinSap:true,fechaFiltro:'Fecha del pedido SAP; no se infiere fecha de cancelacion'};
  await mkdir('../documentacion',{recursive:true});
  await writeFile('../documentacion/validacion-cancelaciones-sap.json',JSON.stringify(resultado,null,2));
  console.info(JSON.stringify(resultado));
} finally { await cerrarConexionSap(); await cerrarConexionPedidosBodega(); }
