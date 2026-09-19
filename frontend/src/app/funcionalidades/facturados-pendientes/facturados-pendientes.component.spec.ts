import { signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject, Subject, of, throwError } from 'rxjs';
import { FacturadosPendientesComponent } from './facturados-pendientes.component';
import { FacturadosPendientesService } from './facturados-pendientes.service';
import { AlmacenesService } from '../pedidos/almacenes.service';
import { AutenticacionService } from '../autenticacion/autenticacion.service';
import { FiltrosGlobalesService } from '../../compartido/filtros-globales.service';
import type { FacturadoPendiente, FiltrosFacturadosPendientes, RespuestaFacturadosPendientes } from './facturados-pendientes.interface';

describe('Facturados pendientes: vista operativa aislada',()=> {
  let fixture:ComponentFixture<FacturadosPendientesComponent>;
  let ruta:BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  const servicio={listar:vi.fn(),obtener:vi.fn(),confirmar:vi.fn()};
  const usuario=signal({nombreUsuario:'gcruz',codigoRol:'OPERADOR_BODEGA'});
  const linea={idOrigen:'R1:TSPS01:PE1',identificadorDetalle:'7',codigoArticulo:'ABC',descripcion:'Producto',cantidad:1,
    codigoAlmacen:'BSPS04',responsable:'Responsable',usuarioAsignado:'gcruz',version:'a'.repeat(64)};
  const pedido:FacturadoPendiente={idOrigen:linea.idOrigen,numeroPedido:'101475000',nombreVendedor:'Vendedor',
    fechaHoraPedido:'2026-09-18T08:00:00',estadoFinanciero:'Facturado',estadoOperativo:'Entrega pendiente',totalArticulos:7,
    controladosManualmente:1,confirmados:0,pendientes:1,sinValidacionManual:6,sinConfiguracion:0,lineas:[linea]};
  const respuesta:RespuestaFacturadosPendientes={datos:[pedido],paginacion:{pagina:1,cantidadPorPagina:25,totalRegistros:1,hayMas:false},almacenesSinConfiguracion:[]};
  beforeEach(async()=> {
    vi.useFakeTimers();Object.values(servicio).forEach(m=>m.mockReset());usuario.set({nombreUsuario:'gcruz',codigoRol:'OPERADOR_BODEGA'});
    servicio.listar.mockReturnValue(of(respuesta));servicio.obtener.mockReturnValue(of({datos:pedido}));servicio.confirmar.mockReturnValue(of({exito:true}));
    ruta=new BehaviorSubject(convertToParamMap({}));
    await TestBed.configureTestingModule({imports:[FacturadosPendientesComponent],providers:[provideRouter([]),
      provideHttpClient(),provideHttpClientTesting(),{provide:FacturadosPendientesService,useValue:servicio},
      {provide:AlmacenesService,useValue:{obtenerAlmacenes:()=>of({datos:[{codigoAlmacen:'BSPS04',nombreAlmacen:'Bodega 4'}]})}},
      {provide:AutenticacionService,useValue:{usuario}},{provide:FiltrosGlobalesService,useValue:{obtener:()=>({codigosAlmacen:['BSPS04']})}},
      {provide:ActivatedRoute,useValue:{paramMap:ruta}},
    ]}).compileComponents();
    fixture=TestBed.createComponent(FacturadosPendientesComponent);fixture.detectChanges();
  });
  afterEach(()=> {fixture.destroy();vi.useRealTimers();});
  it('muestra estado financiero y operativo, responsable y solo la línea pendiente',()=> {
    const texto=fixture.nativeElement.textContent;
    expect(texto).toContain('Facturado');expect(texto).toContain('Pendiente de entrega');expect(texto).toContain('Responsable');
    expect(fixture.nativeElement.querySelectorAll('tbody tr').length).toBe(1);
    expect(servicio.listar).toHaveBeenCalledWith(expect.objectContaining({codigosAlmacen:['BSPS04'],fechaDesde:'',fechaHasta:''}));
  });
  it('por pedido muestra 7/1/0/1/6 sin crear pendientes para las seis sin validación',()=> {
    fixture.componentInstance.cambiarVista('pedido');fixture.detectChanges();
    const celdas=[...fixture.nativeElement.querySelectorAll('tbody td')].map((e:HTMLElement)=>e.textContent?.trim());
    expect(celdas.slice(1,6)).toEqual(['7','1','0','1','6']);
  });
  it('bodega sin clasificación tiene advertencia explícita, no Entregado automático',()=> {
    servicio.listar.mockReturnValue(of({...respuesta,datos:[],almacenesSinConfiguracion:['BSPS04']}));
    fixture.componentInstance.buscar();fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Bodegas sin control definido: BSPS04');
    expect(fixture.nativeElement.textContent).not.toContain('Entregado');
  });
  it('manual sin responsable muestra el texto solicitado, sin asignar',()=> {
    servicio.listar.mockReturnValue(of({...respuesta,datos:[{...pedido,lineas:[{...linea,responsable:null}]}]}));
    fixture.componentInstance.buscar();fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Sin responsable configurado');expect(servicio.confirmar).not.toHaveBeenCalled();
  });
  it('cambio de almacén consulta automáticamente sin cambiar filtros globales',()=> {
    fixture.componentInstance.alternarAlmacen('BSPS04',{target:{checked:false}} as unknown as Event);
    expect(servicio.listar).toHaveBeenLastCalledWith(expect.objectContaining({codigosAlmacen:[],pagina:1}));
  });
  it('nuevo filtro cancela la respuesta anterior, sin sustituir datos con una consulta vieja',()=> {
    const vieja=new Subject<RespuestaFacturadosPendientes>();const nueva=new Subject<RespuestaFacturadosPendientes>();
    servicio.listar.mockReturnValueOnce(vieja).mockReturnValueOnce(nueva);
    fixture.componentInstance.buscar();fixture.componentInstance.cambiarVista('pedido');
    nueva.next({...respuesta,datos:[{...pedido,numeroPedido:'NUEVO'}]});vieja.next(respuesta);
    expect(fixture.componentInstance.registros()[0]!.numeroPedido).toBe('NUEVO');
  });
  it('refresca cada 15 segundos y conserva datos ante fallo temporal',()=> {
    servicio.listar.mockReturnValue(throwError(()=>({status:503,error:{mensaje:'No disponible'}})));
    vi.advanceTimersByTime(15000);
    expect(servicio.listar).toHaveBeenCalledTimes(2);expect(fixture.componentInstance.registros()).toEqual([pedido]);
    expect(fixture.componentInstance.error()).toBe('No disponible');
  });
  it('validación de fechas no dispara una consulta incorrecta',()=> {
    Object.assign(fixture.componentInstance.filtros,{fechaDesde:'2026-09-19',fechaHasta:'2026-09-18'});
    fixture.componentInstance.buscar();expect(servicio.listar).toHaveBeenCalledTimes(1);
    expect(fixture.componentInstance.error()).toBe('Revisá el rango de fechas.');
  });
  it('vista detalle conserva ruta operativa y permite confirmar',()=> {
    ruta.next(convertToParamMap({idOrigen:pedido.idOrigen}));fixture.detectChanges();
    expect(servicio.obtener).toHaveBeenCalledWith(pedido.idOrigen);
    const boton=[...fixture.nativeElement.querySelectorAll('button')].find((b:HTMLButtonElement)=>b.textContent?.trim()==='Confirmar entrega');
    expect(boton.disabled).toBe(false);boton.click();expect(servicio.confirmar).toHaveBeenCalledWith(linea);
  });
  it('al confirmar última línea navega a la cola sin tocar Historial ni Pendientes',()=> {
    ruta.next(convertToParamMap({idOrigen:pedido.idOrigen}));
    servicio.obtener.mockReturnValue(throwError(()=>({status:404})));
    const navegar=vi.spyOn(TestBed.inject(Router),'navigate').mockResolvedValue(true);
    fixture.componentInstance.confirmar(linea);
    expect(navegar).toHaveBeenCalledWith(['/pedidos/facturados-pendientes']);
    expect(fixture.componentInstance.registros()).toEqual([]);
  });
  it('conserva reglas de responsables de despacho existentes',()=> {
    const c=fixture.componentInstance;usuario.set({nombreUsuario:'tlopez',codigoRol:'OPERADOR_BODEGA'});
    expect(c.puedeConfirmar(linea)).toBe(false);expect(c.puedeConfirmar({...linea,usuarioAsignado:'tlopez'})).toBe(true);
    usuario.set({nombreUsuario:'jlara',codigoRol:'OPERADOR_BODEGA'});
    expect(c.puedeConfirmar({...linea,usuarioAsignado:'acalix'})).toBe(true);
    usuario.set({nombreUsuario:'consulta',codigoRol:'CONSULTA'});expect(c.puedeConfirmar({...linea,usuarioAsignado:null})).toBe(false);
  });
  it('reajusta página si desaparece su última línea',()=> {
    servicio.listar.mockReturnValue(of({...respuesta,datos:[],paginacion:{...respuesta.paginacion,totalRegistros:0}}));
    fixture.componentInstance.cambiarPagina(3);
    expect(fixture.componentInstance.pagina()).toBe(1);
    expect((servicio.listar.mock.calls.at(-1)![0] as FiltrosFacturadosPendientes).pagina).toBe(1);
  });
});
