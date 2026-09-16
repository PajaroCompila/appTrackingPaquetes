import 'dotenv/config';
import express from 'express';
import request from 'supertest';
import assert from 'node:assert/strict';
import { inicializarConexionPedidosBodega, obtenerPoolPedidosBodega, cerrarConexionPedidosBodega } from '../src/infraestructura/sql/conexionPedidosBodega.js';
import { cerrarConexionSap } from '../src/infraestructura/sql/conexionSap.js';
import { cerrarConexionesSucursalesR1, obtenerPoolSucursalR1, obtenerSucursalesR1 } from '../src/infraestructura/sql/conexionSucursalesR1.js';
import { consultarSistemaOrigen } from '../src/infraestructura/sql/consultaSistemaOrigen.js';
import { crearPedidoRutas } from '../src/modulos/pedidos/pedidoRutas.js';
import { PedidoSucursalesRepositorio } from '../src/modulos/pedidos/pedidoSucursalesRepositorio.js';
import { DespachoRepositorio } from '../src/modulos/despachos/despachoRepositorio.js';
import { ConciliacionEntregaPedido } from '../src/modulos/pedidos/conciliacionEntregaPedido.js';
import { EntregaSapRepositorio } from '../src/modulos/historial/entregaSapRepositorio.js';

// Usa el handler HTTP real con identidad administrativa exclusivamente dentro
// de este proceso de validación; no crea sesiones ni cambia autenticación.
await inicializarConexionPedidosBodega();
try {
  const origen=new PedidoSucursalesRepositorio(), despachos=new DespachoRepositorio();
  const conciliacion=new ConciliacionEntregaPedido();
  const app=express();
  app.use((req,_res,next) => {
    req.user={usuarioId:'validacion',nombreUsuario:'validacion',nombreVisible:'Validación',
      codigoRol:'ADMINISTRADOR',codigoAlmacen:null,sesionId:'validacion',debeCambiarContrasena:false};next();
  });
  app.use('/antes',crearPedidoRutas(origen,despachos));
  app.use('/api/pedidos',crearPedidoRutas(origen,despachos,undefined,conciliacion));
  const query='?numeroPedido=101475685&fechaDesde=2026-09-14&fechaHasta=2026-09-14&pagina=1&cantidadPorPagina=25';
  const tiempos:{antes:number[];despues:number[]}={antes:[],despues:[]};
  for(let i=0;i<5;i++) {
    for(const [grupo,ruta] of [['antes','/antes'],['despues','/api/pedidos']] as const) {
      const t=performance.now();const res=await request(app).get(ruta+query);
      tiempos[grupo].push(Math.round(performance.now()-t));assert.equal(res.status,200);
      assert.equal(res.body.datos.length,grupo==='antes'?1:0);
      if(grupo==='despues')assert.equal(res.body.paginacion.totalRegistros,0);
    }
  }
  const historia=await new EntregaSapRepositorio().obtener('SAP:PAJARO_AZUL:15:6669');
  assert.ok(historia);
  assert.equal(historia?.estadoHistorial,'Entregado, Sin factura');assert.equal(historia?.articulos.length,2);
  const local=await obtenerPoolPedidosBodega().request().query(`
    SELECT COUNT(*) AS cantidad FROM dbo.EntregaSapHistorial WHERE docEntry=6669;
    SELECT idPedido,partida,cantidad,tipoRelacion FROM dbo.ConciliacionEntregaPedido
      WHERE idEntrega='SAP:PAJARO_AZUL:15:6669' AND activa=1 ORDER BY partida;
    SELECT COUNT(*) AS cantidad FROM dbo.ConciliacionEntregaPedido WHERE idEntrega='SAP:PAJARO_AZUL:15:4432';
  `);
  const conjuntos=local.recordsets as import('mssql').IRecordSet<unknown>[];
  assert.equal((conjuntos[0]?.[0] as {cantidad:number}).cantidad,1);
  assert.equal(conjuntos[1]?.length,2);
  assert.equal((conjuntos[2]?.[0] as {cantidad:number}).cantidad,0);
  const sucursal=obtenerSucursalesR1().find(s=>s.codigoTienda==='TSPS01');assert.ok(sucursal);
  const pool=await obtenerPoolSucursalR1(sucursal);
  const r1=await consultarSistemaOrigen(`SELECT Name,U_SO1_VERIFICADO,U_SO1_STATUS,U_SO1_FACTURA
    FROM [@SO1_01VENTA] WHERE Name='SPSS03PE390619'`,r=>r,()=>pool);
  assert.equal(r1.recordset[0]?.U_SO1_VERIFICADO,'N');assert.equal(r1.recordset[0]?.U_SO1_STATUS,'A');
  const normales=await consultarSistemaOrigen<{numero:string;fecha:string}>(`SELECT TOP (3) CONVERT(varchar(20),U_SO1_DOCUMENTOSBO) numero,
      CONVERT(char(10),U_SO1_FECHA,126) AS fecha
    FROM [@SO1_01VENTA] WHERE U_SO1_TIPO='PE' AND U_SO1_STATUS='A' AND ISNULL(U_SO1_VERIFICADO,'N')<>'Y'
      AND Name<>'SPSS03PE390619'
      ORDER BY U_SO1_FECHA DESC,U_SO1_HORA DESC`,r=>r,()=>pool);
  const comprobados=[];
  for(const p of normales.recordset) {
    const filtro=`?numeroPedido=${encodeURIComponent(p.numero)}&fechaDesde=${p.fecha}&fechaHasta=${p.fecha}&pagina=1&cantidadPorPagina=25`;
    const antes=await request(app).get('/antes'+filtro),despues=await request(app).get('/api/pedidos'+filtro);
    assert.equal(antes.status,200);assert.equal(despues.status,200);
    assert.deepEqual(despues.body.datos.map((p:{idOrigen:string})=>p.idOrigen),antes.body.datos.map((p:{idOrigen:string})=>p.idOrigen));
    comprobados.push({numero:p.numero,cantidad:despues.body.datos.length});
  }
  const mediana=(valores:number[])=>valores.slice(1).sort((a,b)=>a-b).slice(1,3).reduce((s,n)=>s+n,0)/2;
  console.log(JSON.stringify({tiemposHttpMs:tiempos,medianaCalienteMs:{antes:mediana(tiempos.antes),despues:mediana(tiempos.despues)},
    historial:{id:historia.idOrigen,numero:historia.numeroPedido,estado:historia.estadoHistorial,lineas:historia.articulos.length},
    conciliaciones:conjuntos[1],r1SinCambios:r1.recordset,normalesSinRelacion:comprobados},null,2));
} finally {
  await Promise.allSettled([cerrarConexionPedidosBodega(),cerrarConexionSap(),cerrarConexionesSucursalesR1()]);
}
