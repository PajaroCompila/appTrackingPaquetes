import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { PedidosDevueltosComponent } from './pedidos-devueltos.component';
import { PedidosDevueltosService } from './pedidos-devueltos.service';
import { AlmacenesService } from '../pedidos/almacenes.service';
import { AutenticacionService } from '../autenticacion/autenticacion.service';
import { FiltrosGlobalesService } from '../../compartido/filtros-globales.service';
import { obtenerFechaLocalActual } from '../../compartido/estado-filtros-sesion';
import type { PedidoDevuelto } from './pedidos-devueltos.interface';
const pedido: PedidoDevuelto = {idClave:'a'.repeat(64),idOrigen:'SAP:949637',numeroPedido:'101471323',
  origenPedido:'SAP',nombreVendedor:'Vendedor',fechaHoraPedido:'2026-09-02T15:00:00Z',fechaCancelacion:null,
  estado:'CANCEL',totalLineas:1,lineas:[{identificadorDetalle:'0',codigoArticulo:'A',descripcion:'Articulo',cantidad:2,codigoAlmacen:'BSPS04',estado:'CANCEL'}]};

describe('historial de pedidos CANCEL', () => {
  let fixture: ComponentFixture<PedidosDevueltosComponent>;
  let servicio: {listar:ReturnType<typeof vi.fn>;obtener:ReturnType<typeof vi.fn>;confirmar:ReturnType<typeof vi.fn>};
  async function crear(id?: string, codigosGlobales = ['OTRA']) {
    TestBed.configureTestingModule({imports:[PedidosDevueltosComponent],providers:[provideRouter([]),provideHttpClient(),
      {provide:PedidosDevueltosService,useValue:servicio},
      {provide:AlmacenesService,useValue:{obtenerAlmacenes:()=>of({datos:[]})}},
      {provide:AutenticacionService,useValue:{usuario:signal({codigoRol:'ADMINISTRADOR',codigosAlmacenVisibles:[]})}},
      {provide:ActivatedRoute,useValue:{paramMap:of(convertToParamMap(id?{idOrigen:id}:{})),queryParamMap:of(convertToParamMap({})),snapshot:{queryParamMap:convertToParamMap({})}}},
    ]});
    TestBed.inject(FiltrosGlobalesService).actualizar({fechaDesde:'2026-09-28',fechaHasta:'2026-09-28',codigosAlmacen:codigosGlobales});
    vi.spyOn(TestBed.inject(Router),'navigate').mockResolvedValue(true);
    fixture=TestBed.createComponent(PedidosDevueltosComponent);fixture.detectChanges();await fixture.whenStable();
  }
  beforeEach(()=>{
    localStorage.clear();sessionStorage.clear();
    servicio={listar:vi.fn().mockReturnValue(of({datos:[pedido],paginacion:{pagina:1,cantidadPorPagina:25,totalRegistros:1,hayMas:false}})),
      obtener:vi.fn().mockReturnValue(of({datos:pedido})),confirmar:vi.fn()};
  });
  afterEach(()=>fixture?.destroy());
  it('muestra CERRADO en el detalle y no permite confirmar recepcion',async()=>{
    const cerrado: PedidoDevuelto={...pedido,estado:'CERRADO',lineas:pedido.lineas.map(l=>({...l,estado:'CERRADO'}))};
    servicio.obtener.mockReturnValue(of({datos:cerrado}));
    await crear(cerrado.idClave);
    expect(fixture.nativeElement.textContent).toContain('Detalle del pedido cerrado');
    expect(fixture.nativeElement.textContent).toContain('CERRADO');
    expect(fixture.nativeElement.textContent).not.toContain('CANCELADO');
    expect(fixture.componentInstance.puedeConfirmar(cerrado.lineas[0]!)).toBe(false);
  });
  it('consulta por defecto solo los pedidos devueltos del dia actual',async()=>{
    await crear();
    const fechaActual=obtenerFechaLocalActual();
    expect(servicio.listar).toHaveBeenCalledWith(expect.objectContaining({fechaDesde:fechaActual,fechaHasta:fechaActual,codigosAlmacen:['OTRA']}));
    expect(fixture.nativeElement.textContent).toContain('101471323');
    expect(fixture.nativeElement.textContent).toContain('CANCELADO');
    expect(fixture.nativeElement.textContent).not.toContain('CANCEL</span>');
    expect(fixture.nativeElement.textContent).not.toContain('Confirmar');
    expect(fixture.nativeElement.textContent).not.toContain('Progreso');
  });
  it('usa el mismo componente de detalle de Historial',async()=>{
    await crear(pedido.idClave);
    expect(fixture.nativeElement.querySelector('app-detalle-pedido-vista')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('101471323');
    expect(fixture.nativeElement.textContent).toContain('Fecha del pedido');
    expect(fixture.nativeElement.textContent).not.toContain('Fecha de entrega');
    expect(fixture.componentInstance.detalleVisual()?.fechaPedido).toBe(pedido.fechaHoraPedido);
  });
  it('no permite confirmar recepcion fisica de un CANCEL',async()=>{
    await crear();const c=fixture.componentInstance;
    expect(c.puedeConfirmar(pedido.lineas[0]!)).toBe(false);
    c.alternarLinea(pedido,pedido.lineas[0]!);c.confirmarDevolucion();
    expect(servicio.confirmar).not.toHaveBeenCalled();
  });
  it('filtra por fecha de pedido y cambia a articulos',async()=>{
    await crear();const c=fixture.componentInstance;
    c.filtros.fechaDesde='2026-09-10';c.filtros.fechaHasta='2026-09-10';c.cambiarVista('articulos');await Promise.resolve();
    expect(servicio.listar).toHaveBeenLastCalledWith(expect.objectContaining({fechaDesde:'2026-09-10',fechaHasta:'2026-09-10',vista:'articulos'}));
    c.limpiarFiltros();await Promise.resolve();
    const fechaActual=obtenerFechaLocalActual();
    expect(c.filtros.fechaDesde).toBe(fechaActual);expect(c.filtros.fechaHasta).toBe(fechaActual);
  });
  it('conserva las bodegas globales al paginar, cambiar vista y refrescar',async()=>{
    const codigos=['BSPS04','BSPS03','BSPS08'];
    await crear(undefined,codigos);const c=fixture.componentInstance;
    expect(c.filtros.codigosAlmacen).toEqual(codigos);
    expect(servicio.listar).toHaveBeenLastCalledWith(expect.objectContaining({codigosAlmacen:codigos,pagina:1}));
    expect(TestBed.inject(FiltrosGlobalesService).obtener().codigosAlmacen).toEqual(codigos);

    c.irPagina(2);await Promise.resolve();
    expect(servicio.listar).toHaveBeenLastCalledWith(expect.objectContaining({codigosAlmacen:codigos,pagina:2}));
    expect(TestBed.inject(Router).navigate).toHaveBeenLastCalledWith([],expect.objectContaining({
      queryParams:expect.objectContaining({codigoAlmacen:codigos,pagina:2}),
    }));

    c.cambiarVista('articulos');await Promise.resolve();
    expect(servicio.listar).toHaveBeenLastCalledWith(expect.objectContaining({
      codigosAlmacen:codigos,vista:'articulos',pagina:1,
    }));
    (c as unknown as {consultar:{next():void}}).consultar.next();
    expect(servicio.listar).toHaveBeenLastCalledWith(expect.objectContaining({codigosAlmacen:codigos}));
  });
  it('conserva los filtros en el enlace de regreso',async()=>{
    await crear();fixture.componentInstance.filtros.numeroPedido='101471323';
    expect(fixture.componentInstance.parametrosRetorno().retorno).toContain('numeroPedido=101471323');
  });
  it('muestra error inicial y permite reintentar',async()=>{
    servicio.listar.mockReturnValue(throwError(()=>({error:{mensaje:'SAP no disponible'}})));
    await crear();expect(fixture.nativeElement.textContent).toContain('SAP no disponible');
    expect(fixture.componentInstance.cargando()).toBe(false);
  });
  it('muestra de forma persistente quien recibió la devolución',async()=>{
    const recibido={...pedido,estado:'DEVUELTO' as const,recibidoPor:'Gregorio Cruz',
      recibidoEn:'2026-10-05T15:00:00Z',lineas:pedido.lineas.map(linea=>({...linea,
        estado:'DEVUELTO' as const,recibidoPor:'Gregorio Cruz',recibidoEn:'2026-10-05T15:00:00Z'}))};
    servicio.listar.mockReturnValue(of({datos:[recibido],paginacion:{pagina:1,cantidadPorPagina:25,totalRegistros:1,hayMas:false}}));
    await crear();
    expect(fixture.nativeElement.textContent).toContain('Gregorio Cruz');
    expect(fixture.nativeElement.textContent).toContain('DEVUELTO');
  });
});
