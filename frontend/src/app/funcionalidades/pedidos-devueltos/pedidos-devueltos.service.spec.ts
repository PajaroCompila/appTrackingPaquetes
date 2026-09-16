import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { PedidosDevueltosService } from './pedidos-devueltos.service';
describe('PedidosDevueltosService',()=>{
  let http:HttpTestingController;let s:PedidosDevueltosService;
  beforeEach(()=>{TestBed.configureTestingModule({providers:[provideHttpClient(),provideHttpClientTesting()]});http=TestBed.inject(HttpTestingController);s=TestBed.inject(PedidosDevueltosService);});
  afterEach(()=>http.verify());
  it('envía página, vista, estado y todos los almacenes sin fijar página 1',()=>{
    s.listar({numeroPedido:'1001',fechaDesde:'2026-09-15',fechaHasta:'2026-09-16',codigosAlmacen:['BSPS03','BSPS02'],estado:'parcial',pagina:2,cantidadPorPagina:50,vista:'articulos'}).subscribe();
    const r=http.expectOne(r=>r.url.endsWith('/pedidos-devueltos'));expect(r.request.params.get('pagina')).toBe('2');expect(r.request.params.getAll('codigoAlmacen')).toEqual(['BSPS03','BSPS02']);expect(r.request.params.get('estado')).toBe('parcial');r.flush({datos:[],paginacion:{}});
  });
  it('confirmación no envía receptor, vendedor ni bodega elegidos por frontend',()=>{
    const lineas=[{idClave:'a'.repeat(64),identificadorDetalle:'1'}];s.confirmar(lineas).subscribe();const r=http.expectOne(r=>r.url.endsWith('/api/pedidos-devueltos/confirmar'));expect(r.request.body).toEqual({lineas});r.flush({exito:true});
  });
});
