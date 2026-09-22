import { Component, DestroyRef, inject, signal, type OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { EMPTY, Subject, catchError, finalize, map, switchMap } from 'rxjs';
import { FiltrosGlobalesService } from '../../compartido/filtros-globales.service';
import { SelectorAlmacenesDirective } from '../../compartido/interaccion/selector-almacenes.directive';
import { PaginacionComponent } from '../../compartido/paginacion/paginacion.component';
import { CodigoArticuloInventarioDirective } from '../../compartido/inventario/codigo-articulo-inventario.directive';
import { esFechaCalendarioValida, obtenerFechaLocalActual } from '../../compartido/estado-filtros-sesion';
import { AutenticacionService } from '../autenticacion/autenticacion.service';
import { AlmacenesService } from '../pedidos/almacenes.service';
import type { Almacen } from '../pedidos/almacen.interface';
import { FacturadosPendientesService } from './facturados-pendientes.service';
import type { FacturadoPendiente, FiltrosFacturadosPendientes, LineaFacturadaPendiente,
  RespuestaFacturadosPendientes } from './facturados-pendientes.interface';

@Component({
  selector:'app-facturados-pendientes',imports:[FormsModule,RouterLink,SelectorAlmacenesDirective,
    PaginacionComponent,CodigoArticuloInventarioDirective],
  templateUrl:'./facturados-pendientes.component.html',styleUrl:'./facturados-pendientes.component.css',
})
export class FacturadosPendientesComponent implements OnInit {
  private readonly servicio=inject(FacturadosPendientesService);
  private readonly ruta=inject(ActivatedRoute);
  private readonly router=inject(Router);
  private readonly destruir=inject(DestroyRef);
  private readonly almacenesServicio=inject(AlmacenesService);
  private readonly autenticacion=inject(AutenticacionService);
  private readonly globales=inject(FiltrosGlobalesService);
  private readonly consultar=new Subject<void>();
  private aplicados!:FiltrosFacturadosPendientes;
  public readonly registros=signal<FacturadoPendiente[]>([]);
  public readonly idOrigen=signal<string|null>(null);
  public readonly almacenes=signal<Almacen[]>([]);
  public readonly sinConfiguracion=signal<string[]>([]);
  public readonly cargando=signal(true);
  public readonly actualizando=signal(false);
  public readonly confirmando=signal(false);
  public readonly error=signal('');
  public readonly mensaje=signal('');
  public readonly errorAlmacenes=signal(false);
  public readonly pagina=signal(1);
  public readonly total=signal(0);
  public readonly vista=signal<'articulos'|'pedido'>('articulos');
  public readonly filtros={numeroPedido:'',fechaDesde:obtenerFechaLocalActual(),fechaHasta:obtenerFechaLocalActual(),
    codigosAlmacen:this.globales.obtener().codigosAlmacen,cantidadPorPagina:25};

  public ngOnInit():void {
    this.almacenesServicio.obtenerAlmacenes().pipe(takeUntilDestroyed(this.destruir)).subscribe({
      next:r=>this.almacenes.set(r.datos),error:()=>this.errorAlmacenes.set(true),
    });
    this.consultar.pipe(switchMap(()=> {
      this.actualizando.set(true);
      const consulta=this.idOrigen() ? this.servicio.obtener(this.idOrigen()!).pipe(map(r=>({
        datos:[r.datos],paginacion:{pagina:1,cantidadPorPagina:25,totalRegistros:1,hayMas:false},
        almacenesSinConfiguracion:[],
      } satisfies RespuestaFacturadosPendientes))) : this.servicio.listar(this.aplicados);
      return consulta.pipe(catchError((e:{status?:number;error?:{mensaje?:string}})=> {
        if (this.idOrigen() && e.status===404 && this.registros().length) {
          this.registros.set([]);
          void this.router.navigate(['/pedidos/facturados-pendientes']);
        } else this.error.set(e.error?.mensaje || 'No se pudieron actualizar los facturados pendientes.');
        return EMPTY;
      }),finalize(()=> {this.actualizando.set(false);this.cargando.set(false);}));
    }),takeUntilDestroyed(this.destruir)).subscribe(r=> {
      this.registros.set(r.datos);this.total.set(r.paginacion.totalRegistros);
      this.sinConfiguracion.set(r.almacenesSinConfiguracion);this.error.set('');
      const ultima=Math.max(1,Math.ceil(this.total()/this.filtros.cantidadPorPagina));
      if (!this.idOrigen() && this.pagina()>ultima) {this.pagina.set(ultima);this.aplicar();}
    });
    this.ruta.paramMap.pipe(takeUntilDestroyed(this.destruir)).subscribe(p=> {
      this.registros.set([]);this.cargando.set(true);this.idOrigen.set(p.get('idOrigen'));this.aplicar();
    });
    const intervalo=setInterval(()=> {
      if (!this.actualizando() && !this.confirmando()) this.consultar.next();
    },15000);
    this.destruir.onDestroy(()=>clearInterval(intervalo));
  }

  public aplicar():void {
    if ((this.filtros.fechaDesde && !esFechaCalendarioValida(this.filtros.fechaDesde))
      || (this.filtros.fechaHasta && !esFechaCalendarioValida(this.filtros.fechaHasta))
      || (this.filtros.fechaDesde && this.filtros.fechaHasta && this.filtros.fechaDesde>this.filtros.fechaHasta)) {
      this.error.set('Revisá el rango de fechas.');return;
    }
    this.aplicados={...this.filtros,codigosAlmacen:[...this.filtros.codigosAlmacen],pagina:this.pagina(),vista:this.vista()};
    this.consultar.next();
  }
  public buscar():void {this.pagina.set(1);this.aplicar();}
  public cambiarVista(v:'articulos'|'pedido'):void {this.vista.set(v);this.buscar();}
  public cambiarPagina(p:number):void {this.pagina.set(p);this.aplicar();}
  public alternarAlmacen(codigo:string,event:Event):void {
    this.filtros.codigosAlmacen=(event.target as HTMLInputElement).checked
      ? [...new Set([...this.filtros.codigosAlmacen,codigo])] : this.filtros.codigosAlmacen.filter(c=>c!==codigo);
    this.buscar();
  }
  public limpiar():void {
    const fechaActual=obtenerFechaLocalActual();
    Object.assign(this.filtros,{numeroPedido:'',fechaDesde:fechaActual,fechaHasta:fechaActual,codigosAlmacen:[],cantidadPorPagina:25});this.buscar();
  }
  public puedeConfirmar(linea:LineaFacturadaPendiente):boolean {
    const u=this.autenticacion.usuario();
    if (!u || !['ADMINISTRADOR','OPERADOR_BODEGA'].includes(u.codigoRol ?? '')) return false;
    const propio=u.nombreUsuario.toLowerCase();const asignado=linea.usuarioAsignado?.toLowerCase();
    return !asignado || u.codigoRol==='ADMINISTRADOR' || propio==='gcruz' || propio===asignado
      || (['acalix','jlara'].includes(propio) && ['acalix','jlara'].includes(asignado));
  }
  public confirmar(linea:LineaFacturadaPendiente):void {
    if (this.confirmando() || !this.puedeConfirmar(linea)) return;
    this.confirmando.set(true);this.mensaje.set('');
    this.servicio.confirmar(linea).pipe(takeUntilDestroyed(this.destruir),finalize(()=>this.confirmando.set(false)))
      .subscribe({next:()=> {this.mensaje.set('Entrega confirmada.');this.consultar.next();},
        error:(e:{error?:{mensaje?:string}})=> {this.error.set(e.error?.mensaje || 'No se pudo confirmar la entrega.');}});
  }
}
