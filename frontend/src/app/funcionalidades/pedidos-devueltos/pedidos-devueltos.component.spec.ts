import { signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { of, throwError } from 'rxjs';
import { PedidosDevueltosComponent } from './pedidos-devueltos.component';
import { PedidosDevueltosService } from './pedidos-devueltos.service';
import { AlmacenesService } from '../pedidos/almacenes.service';
import { AutenticacionService } from '../autenticacion/autenticacion.service';
import { FiltrosGlobalesService } from '../../compartido/filtros-globales.service';
import type { UsuarioSesion } from '../autenticacion/autenticacion.interface';
import type { PedidoDevuelto } from './pedidos-devueltos.interface';
import { PedidosService } from '../pedidos/pedidos.service';
const pedido:PedidoDevuelto={idClave:'a'.repeat(64),idOrigen:'R1:TSPS01:PE1',numeroPedido:'1001',nombreVendedor:'Vendedor original',
  origenPedido:'R1',fechaDespacho:'2026-09-16T14:00:00Z',fechaCancelacion:'2026-09-16T15:00:00Z',motivo:'Pedido cancelado',
  estado:'DEVOLUCIÓN PARCIAL',totalLineas:4,lineasRecibidas:2,lineas:[
    {identificadorDetalle:'1',codigoArticulo:'A',descripcion:'Artículo original',cantidad:2,codigoAlmacen:'BSPS03',estado:'PENDIENTE DE DEVOLUCIÓN'},
    {identificadorDetalle:'2',codigoArticulo:'B',descripcion:'Artículo B',cantidad:1,codigoAlmacen:'BSPS02',estado:'DEVUELTO',recibidoPor:'Jorge',recibidoEn:'2026-09-16T16:00:00Z'},
  ]};
describe('PedidosDevueltosComponent',()=>{
  let fixture:ComponentFixture<PedidosDevueltosComponent>;
  let c:PedidosDevueltosComponent;
  let servicio:{listar:ReturnType<typeof vi.fn>;obtener:ReturnType<typeof vi.fn>;confirmar:ReturnType<typeof vi.fn>};
  let router:{navigate:ReturnType<typeof vi.fn>};
  let obtenerInventarioArticulo:ReturnType<typeof vi.fn>;
  const usuario=signal<UsuarioSesion|null>(null);
  let id:string|null;
  beforeEach(()=>{
    localStorage.clear();sessionStorage.clear();id=null;
    usuario.set({usuarioId:'1',nombreUsuario:'ana',nombreVisible:'Ana',codigoRol:'OPERADOR_BODEGA',codigoAlmacen:null,codigosAlmacenVisibles:['BSPS03'],debeCambiarContrasena:false});
    servicio={listar:vi.fn().mockReturnValue(of({datos:[],paginacion:{pagina:1,cantidadPorPagina:25,cantidadDevuelta:0,totalRegistros:0,hayMas:false}})),
      obtener:vi.fn().mockReturnValue(of({datos:pedido})),confirmar:vi.fn().mockReturnValue(of({exito:true}))};
    obtenerInventarioArticulo=vi.fn().mockReturnValue(of({codigoArticulo:'A',descripcion:'Artículo original',codigoAlmacen:'BSPS03',nombreAlmacen:'Bodega',existenciaFisica:2,existencias:[]}));
    router={navigate:vi.fn().mockResolvedValue(true)};
  });
  async function crear(globales = false){
    await TestBed.configureTestingModule({imports:[PedidosDevueltosComponent],providers:[
      {provide:PedidosDevueltosService,useValue:servicio},{provide:AlmacenesService,useValue:{obtenerAlmacenes:()=>of({datos:[]})}},
      {provide:PedidosService,useValue:{obtenerInventarioArticulo}},
      {provide:AutenticacionService,useValue:{usuario}},{provide:Router,useValue:router},
      {provide:ActivatedRoute,useValue:{paramMap:of(convertToParamMap(id?{idOrigen:id}:{})),queryParamMap:of(convertToParamMap({})),snapshot:{queryParamMap:convertToParamMap({})}}},
    ]}).compileComponents();
    if(globales) TestBed.inject(FiltrosGlobalesService).actualizar({fechaDesde:'2026-09-15',fechaHasta:'2026-09-16',codigosAlmacen:['BSPS03']});
    fixture=TestBed.createComponent(PedidosDevueltosComponent);c=fixture.componentInstance;fixture.detectChanges();
  }
  afterEach(()=>fixture?.destroy());
  it('muestra encabezado, filtros, Pedido primero y estado vacío, sin porcentajes',async()=>{
    await crear();const texto=fixture.nativeElement.textContent;
    expect(texto).toContain('Pedidos devueltos');expect(texto).toContain('No hay pedidos devueltos con los filtros seleccionados.');
    expect(fixture.nativeElement.querySelectorAll('form input').length).toBe(3);
    const tabs=fixture.nativeElement.querySelectorAll('[role=tab]');expect(tabs[0].textContent.trim()).toBe('Pedido');expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    expect(texto).not.toContain('%');expect(texto).not.toContain('Porcentaje');
  });
  it('reutiliza filtros globales y muestra avance como líneas recibidas / total',async()=>{
    servicio.listar.mockReturnValue(of({datos:[pedido],paginacion:{pagina:1,cantidadPorPagina:25,cantidadDevuelta:1,totalRegistros:1,hayMas:false}}));
    await crear(true);expect(servicio.listar).toHaveBeenCalledWith(expect.objectContaining({codigosAlmacen:['BSPS03'],fechaDesde:'2026-09-15',vista:'pedido'}));
    expect(fixture.nativeElement.textContent).toContain('2 / 4');expect(fixture.nativeElement.textContent).not.toContain('%');
  });
  it('permite seleccionar solamente pendientes de la bodega autorizada y confirma en lote',async()=>{
    await crear();c.alternarLinea(pedido,pedido.lineas[0]!);c.alternarLinea(pedido,pedido.lineas[1]!);expect(c.seleccion().size).toBe(1);
    c.confirmarDevolucion();expect(servicio.confirmar).toHaveBeenCalledWith([{idClave:pedido.idClave,identificadorDetalle:'1'}]);expect(c.seleccion().size).toBe(0);
  });
  it('consulta no selecciona ni confirma; administrador puede recibir otra bodega',async()=>{
    await crear();usuario.update(u=>({...u!,codigoRol:'CONSULTA'}));c.alternarLinea(pedido,pedido.lineas[0]!);c.confirmarDevolucion();expect(servicio.confirmar).not.toHaveBeenCalled();
    usuario.update(u=>({...u!,codigoRol:'ADMINISTRADOR'}));expect(c.puedeConfirmar({...pedido.lineas[0]!,codigoAlmacen:'TCIR01'})).toBe(true);
  });
  it('operador sin bodegas autorizadas no puede seleccionar para recibir',async()=>{
    await crear();usuario.update(u=>({...u!,codigosAlmacenVisibles:[]}));
    expect(c.puedeConfirmar(pedido.lineas[0]!)).toBe(false);
    c.alternarLinea(pedido,pedido.lineas[0]!);expect(c.seleccion().size).toBe(0);
  });
  it('detalle usa su endpoint y muestra despacho original, receptor y fecha sin selector de vendedor',async()=>{
    id=pedido.idClave;await crear();expect(servicio.obtener).toHaveBeenCalledWith(pedido.idClave);expect(servicio.listar).not.toHaveBeenCalled();
    const texto=fixture.nativeElement.textContent;expect(texto).toContain('Fecha despacho original');expect(texto).toContain('Jorge');expect(texto).toContain('Vendedor original');expect(texto).toContain('2 / 4');
    expect(fixture.nativeElement.querySelector('select')).toBeNull();
  });
  it('consulta inventario desde el código tanto en detalle como en artículos',async()=>{
    id=pedido.idClave;await crear();
    (fixture.nativeElement.querySelector('.codigo-articulo') as HTMLElement).click();
    expect(obtenerInventarioArticulo).toHaveBeenCalledWith('A','BSPS03');
  });
  it('error inicial no deja la pantalla vacía',async()=>{
    servicio.listar.mockReturnValue(throwError(()=>({error:{mensaje:'No disponible'}})));await crear();expect(fixture.nativeElement.textContent).toContain('No disponible');expect(c.cargando()).toBe(false);
  });
  it('paginación y vista se envían a la ruta y a la consulta',async()=>{
    await crear();c.cambiarVista('articulos');await Promise.resolve();expect(router.navigate).toHaveBeenCalledWith([],expect.objectContaining({queryParams:expect.objectContaining({vista:'articulos',pagina:1})}));
    c.irPagina(2);await Promise.resolve();expect(servicio.listar).toHaveBeenLastCalledWith(expect.objectContaining({pagina:2,vista:'articulos'}));
  });
});
