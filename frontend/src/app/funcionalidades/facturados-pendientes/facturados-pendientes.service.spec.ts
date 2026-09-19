import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { FacturadosPendientesService } from './facturados-pendientes.service';

describe('API frontend de control físico local',()=> {
  let http:HttpTestingController;let s:FacturadosPendientesService;
  beforeEach(()=> {
    TestBed.configureTestingModule({providers:[provideHttpClient(),provideHttpClientTesting()]});
    http=TestBed.inject(HttpTestingController);s=TestBed.inject(FacturadosPendientesService);
  });
  afterEach(()=>http.verify());
  it('envía vista, paginación, fechas y bodegas repetidas a su endpoint, no a Pedidos normales',()=> {
    s.listar({numeroPedido:'100',fechaDesde:'2026-09-01',fechaHasta:'2026-09-18',codigosAlmacen:['BSPS03','BSPS04'],
      pagina:2,cantidadPorPagina:25,vista:'pedido'}).subscribe();
    const req=http.expectOne(r=>r.url.endsWith('/facturados-pendientes'));
    expect(req.request.params.getAll('codigoAlmacen')).toEqual(['BSPS03','BSPS04']);
    expect(req.request.params.get('pagina')).toBe('2');expect(req.request.params.get('vista')).toBe('pedido');req.flush({datos:[]});
  });
  it('confirmación transmite identidad y versión, no usuario/estado financiero suplantables',()=> {
    s.confirmar({idOrigen:'SAP:100',identificadorDetalle:'0',version:'a'.repeat(64),codigoArticulo:'ABC',descripcion:'Producto',
      cantidad:1,codigoAlmacen:'BODEGA',responsable:null,usuarioAsignado:null}).subscribe();
    const req=http.expectOne(r=>r.url.endsWith('/facturados-pendientes/confirmar'));
    expect(req.request.method).toBe('POST');expect(req.request.body).toEqual({lineas:[{idOrigen:'SAP:100',identificadorDetalle:'0',version:'a'.repeat(64)}]});req.flush({exito:true});
  });
});
