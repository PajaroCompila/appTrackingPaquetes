import { DetallePedidoVistaComponent } from '../../compartido/detalle-pedido/detalle-pedido-vista.component';
import type { ConfiguracionDetallePedido, PedidoDetalleVisual } from '../../compartido/detalle-pedido/detalle-pedido-vista.interface';
import { CommonModule } from '@angular/common';
import { Component, computed, DestroyRef, HostListener, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { SelectorAlmacenesDirective } from '../../compartido/interaccion/selector-almacenes.directive';
import { CodigoArticuloInventarioDirective } from '../../compartido/inventario/codigo-articulo-inventario.directive';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { EMPTY, Subject, catchError, combineLatest, finalize, map, switchMap } from 'rxjs';
import { esFechaCalendarioValida, obtenerFechaLocalActual } from '../../compartido/estado-filtros-sesion';
import { FiltrosGlobalesService } from '../../compartido/filtros-globales.service';
import { formatearFechaHoraHonduras } from '../../compartido/fechas/fecha-honduras';
import { PaginacionComponent } from '../../compartido/paginacion/paginacion.component';
import type { Almacen } from '../pedidos/almacen.interface';
import { AlmacenesService } from '../pedidos/almacenes.service';
import { AutenticacionService } from '../autenticacion/autenticacion.service';
import type { FiltrosPedidosDevueltos, LineaDevolucion, PedidoDevuelto, SeleccionDevolucion } from './pedidos-devueltos.interface';
import { PedidosDevueltosService, type RespuestaPedidosDevueltos } from './pedidos-devueltos.service';

@Component({
  selector: 'app-pedidos-devueltos',
  imports: [DetallePedidoVistaComponent, CommonModule, FormsModule, RouterLink, PaginacionComponent, SelectorAlmacenesDirective, CodigoArticuloInventarioDirective],
  templateUrl: './pedidos-devueltos.component.html',
  styleUrls: ['../pedidos/lista-pedidos.component.css', './pedidos-devueltos.component.css'],
})
export class PedidosDevueltosComponent implements OnInit {
  private readonly servicio = inject(PedidosDevueltosService);
  private readonly ruta = inject(ActivatedRoute);
  private readonly enrutador = inject(Router);
  private readonly almacenesServicio = inject(AlmacenesService);
  private readonly filtrosGlobales = inject(FiltrosGlobalesService);
  private readonly autenticacion = inject(AutenticacionService);
  private readonly destruirRef = inject(DestroyRef);
  private readonly consultar = new Subject<void>();
  private aplicados!: FiltrosPedidosDevueltos;
  private primeraCarga = true;
  private versionRuta = 0;

  public readonly cargando = signal(true);
  public readonly actualizando = signal(false);
  public readonly confirmando = signal(false);
  public readonly error = signal<string | null>(null);
  public readonly mensaje = signal('');
  public readonly devoluciones = signal<PedidoDevuelto[]>([]);
  public readonly detalle = signal<PedidoDevuelto | null>(null);
  public readonly seleccion = signal<ReadonlyMap<string, SeleccionDevolucion>>(new Map());
  public readonly almacenes = signal<Almacen[]>([]);
  public readonly totalRegistros = signal(0);
  public readonly pagina = signal(1);
  public readonly hayMas = signal(false);
  public readonly ultimaActualizacion = signal<Date | null>(null);
  public readonly errorAlmacenes = signal(false);
  public readonly idOrigen = signal<string | null>(null);
  public readonly vista = signal<'pedido' | 'articulos'>('pedido');
  public readonly filtros = {
    numeroPedido: '', fechaDesde: obtenerFechaLocalActual(), fechaHasta: obtenerFechaLocalActual(),
    codigosAlmacen: [] as string[], estado: 'todos' as FiltrosPedidosDevueltos['estado'], cantidadPorPagina: 25,
  };

  public get configuracionDetalle(): ConfiguracionDetallePedido { return {
    contexto: 'Pedidos devueltos', titulo: this.detalle()?.estado === 'DEVUELTO'
      ? 'Detalle del pedido devuelto' : this.detalle()?.estado === 'CERRADO'
        ? 'Detalle del pedido cerrado' : 'Detalle del pedido cancelado',
    descripcion: this.detalle()?.estado === 'DEVUELTO'
      ? 'Devolución recibida físicamente' : this.detalle()?.estado === 'CERRADO'
        ? 'Pedido cerrado sin entrega ni factura en SAP' : 'Pedido cancelado en SAP',
    etiquetaEstado: this.estadoVisible(this.detalle()?.estado), etiquetaFecha: 'Fecha del pedido', severidadEstado: 'peligro',
    etiquetaRetorno: 'Regresar a pedidos devueltos', tituloInformacion: 'Datos del pedido',
    etiquetaArticulos: 'Artículos del pedido', permitirImpresion: false,
  }; }
  public readonly detalleVisual = computed<PedidoDetalleVisual | null>(() => {
    const p = this.detalle();
    const fechaRecepcion = p?.recibidoEn || p?.lineas.find(linea => linea.recibidoEn)?.recibidoEn || null;
    return p ? { idOrigen:p.idOrigen,numeroPedido:p.numeroPedido,tipoDocumento:'Pedido SAP',
      vendedor:p.nombreVendedor ?? null,fechaPedido:p.fechaHoraPedido ?? null,bodega:this.bodegas(p),
      datosOperativos:[{etiqueta:'Estado',valor:this.estadoVisible(p.estado),icono:'pi pi-ban'},
        {etiqueta:'Referencia R1',valor:p.folioPedido || 'No disponible',icono:'pi pi-file'},
        {etiqueta:'Recibido por',valor:this.recibidoPor(p),icono:'pi pi-user'},
        ...(fechaRecepcion ? [{etiqueta:'Fecha de recepción',valor:fechaRecepcion,
          icono:'pi pi-calendar',esFecha:true}] : [])],
      articulos:p.lineas.map(l=>({clave:l.identificadorDetalle,identificadorDetalle:l.identificadorDetalle,
        codigo:l.codigoArticulo,descripcion:l.descripcion,cantidad:l.cantidad,codigoAlmacen:l.codigoAlmacen,
        nombreAlmacen:l.codigoAlmacen ? this.nombreAlmacen(l.codigoAlmacen) : null,estadoEntrega:this.estadoVisible(l.estado)})),
    } : null;
  });
  public regresar(): void { void this.enrutador.navigateByUrl(this.retorno()); }
  public parametrosRetorno(): {retorno:string} {
    const params = new URLSearchParams({numeroPedido:this.filtros.numeroPedido,fechaDesde:this.filtros.fechaDesde,
      fechaHasta:this.filtros.fechaHasta,vista:this.vista(),pagina:String(this.pagina())});
    this.filtros.codigosAlmacen.forEach(c=>params.append('codigoAlmacen',c));
    return {retorno:'/pedidos-devueltos?'+params.toString()};
  }

  public ngOnInit(): void {
    this.cargarAlmacenes();
    const refresco = setInterval(() => {
      if (this.aplicados && !this.actualizando()) this.consultar.next();
    }, 60_000);
    this.destruirRef.onDestroy(() => clearInterval(refresco));
    this.consultar.pipe(
      switchMap(() => {
        this.actualizando.set(true);
        this.error.set(null);
        const consulta = this.idOrigen()
          ? this.servicio.obtener(this.idOrigen()!).pipe(map(({datos}) => ({
            datos:[datos],paginacion:{pagina:1,cantidadPorPagina:25,cantidadDevuelta:1,totalRegistros:1,hayMas:false},
          } satisfies RespuestaPedidosDevueltos)))
          : this.servicio.listar(this.aplicados);
        return consulta.pipe(
          catchError((e: {error?: {mensaje?:string}}) => {
            if(this.primeraCarga || !this.devoluciones().length) this.error.set(e.error?.mensaje || 'No pudimos cargar los pedidos devueltos.');
            return EMPTY;
          }),
          finalize(() => {this.cargando.set(false);this.actualizando.set(false);this.primeraCarga=false;}),
        );
      }),
      takeUntilDestroyed(this.destruirRef),
    ).subscribe(({datos,paginacion}) => {
      this.devoluciones.set(datos);
      this.detalle.set(this.idOrigen() ? datos[0] ?? null : null);
      this.totalRegistros.set(paginacion.totalRegistros);
      this.pagina.set(paginacion.pagina);
      this.hayMas.set(paginacion.hayMas);
      this.ultimaActualizacion.set(new Date());
      const disponibles = new Set(datos.flatMap(p => p.lineas.filter(l => this.puedeConfirmar(l)).map(l => this.clave(p,l))));
      this.seleccion.update(s => new Map([...s].filter(([clave]) => disponibles.has(clave))));
    });
    combineLatest([this.ruta.paramMap,this.ruta.queryParamMap]).pipe(takeUntilDestroyed(this.destruirRef))
      .subscribe(([parametros,q]) => {
        const fechaActual = obtenerFechaLocalActual();
        this.versionRuta += 1;
        this.idOrigen.set(parametros.get('idOrigen'));
        this.filtros.numeroPedido=q.get('numeroPedido') ?? '';
        this.filtros.fechaDesde=esFechaCalendarioValida(q.get('fechaDesde'))?q.get('fechaDesde')!:fechaActual;
        this.filtros.fechaHasta=esFechaCalendarioValida(q.get('fechaHasta'))?q.get('fechaHasta')!:fechaActual;
        const codigosUrl=q.getAll('codigoAlmacen').map(codigo=>codigo.trim()).filter(Boolean);
        this.filtros.codigosAlmacen=codigosUrl.length
          ? [...new Set(codigosUrl)] : this.filtrosGlobales.obtener().codigosAlmacen;
        const estado=q.get('estado');
        this.filtros.estado=estado==='pendiente'||estado==='parcial'||estado==='devuelto'?estado:'todos';
        const cantidad=Number(q.get('cantidadPorPagina'));
        this.filtros.cantidadPorPagina=[25,50,100].includes(cantidad)?cantidad:25;
        const pagina=Number(q.get('pagina'));
        this.pagina.set(Number.isInteger(pagina)&&pagina>0?pagina:1);
        this.vista.set(q.get('vista')==='articulos'?'articulos':'pedido');
        if (!this.idOrigen()) this.guardarGlobales();
        this.aplicados={...this.filtros,codigosAlmacen:[...this.filtros.codigosAlmacen],pagina:this.pagina(),vista:this.vista()};
        this.seleccion.set(new Map());
        this.consultar.next();
      });
  }

  public buscar(): void { this.guardarGlobales(); this.actualizarRuta(1); }
  public limpiarFiltros(): void {
    const fechaActual = obtenerFechaLocalActual();
    Object.assign(this.filtros,{numeroPedido:'',fechaDesde:fechaActual,fechaHasta:fechaActual,codigosAlmacen:[],estado:'todos'});
    this.buscar();
  }
  public cambiarVista(vista:'pedido'|'articulos'):void {if(this.vista()!==vista){this.vista.set(vista);this.actualizarRuta(1);}}
  public irPagina(pagina:number):void {if(!this.actualizando())this.actualizarRuta(pagina);}
  public estaSeleccionado(codigo:string):boolean {return this.filtros.codigosAlmacen.includes(codigo);}
  public alternarAlmacen(codigo:string,seleccionado:boolean):void {
    this.filtros.codigosAlmacen=seleccionado?[...new Set([...this.filtros.codigosAlmacen,codigo])]:this.filtros.codigosAlmacen.filter(c=>c!==codigo);
    this.guardarGlobales();
  }
  public limpiarAlmacenes():void {this.filtros.codigosAlmacen=[];this.guardarGlobales();}
  public resumenAlmacenes():string {
    const c=this.filtros.codigosAlmacen;
    return !c.length?'Todos los almacenes':c.length===1?c[0]!:`${c.length} almacenes seleccionados`;
  }
  public nombreAlmacen(codigo:string):string {return this.almacenes().find(a=>a.codigoAlmacen===codigo)?.nombreAlmacen || codigo;}
  public bodegas(p:PedidoDevuelto):string {return [...new Set(p.lineas.flatMap(l=>l.codigoAlmacen?[l.codigoAlmacen]:[]))].join(', ') || '—';}
  public recibidoPor(p:PedidoDevuelto):string {
    return p.recibidoPor?.trim() || p.lineas.find(l=>l.recibidoPor?.trim())?.recibidoPor?.trim()
      || 'Sin registrar';
  }
  public estadoVisible(estado:string | null | undefined):string {return estado === 'CANCEL' ? 'CANCELADO' : estado || '—';}
  public progreso(p:PedidoDevuelto):string {return `${p.lineasRecibidas ?? p.lineas.filter(l=>l.estado==='DEVUELTO').length} / ${p.totalLineas ?? p.lineas.length}`;}
  public fecha(v:string|null|undefined):string {return formatearFechaHoraHonduras(v);}
  public clave(p:PedidoDevuelto,l:LineaDevolucion):string {return `${p.idClave}\u0000${l.identificadorDetalle}`;}
  public puedeConfirmar(l:LineaDevolucion):boolean {
    const u=this.autenticacion.usuario();
    if(!u||!l.codigoAlmacen||l.estado==='CANCEL'||l.estado==='CERRADO'||l.estado==='DEVUELTO')return false;
    if(u.codigoRol==='ADMINISTRADOR')return true;
    if(u.codigoRol!=='OPERADOR_BODEGA')return false;
    return (u.codigosAlmacenVisibles ?? []).some(c=>c.toUpperCase()===l.codigoAlmacen!.toUpperCase());
  }
  public estaSeleccionada(p:PedidoDevuelto,l:LineaDevolucion):boolean {return this.seleccion().has(this.clave(p,l));}
  public alternarLinea(p:PedidoDevuelto,l:LineaDevolucion):void {
    if(!this.puedeConfirmar(l)||this.confirmando())return;
    this.seleccion.update(s=>{
      const n=new Map(s),clave=this.clave(p,l);
      if(n.has(clave))n.delete(clave);else n.set(clave,{idClave:p.idClave,identificadorDetalle:l.identificadorDetalle});
      return n;
    });
    this.mensaje.set('');
  }
  public confirmarDevolucion():void {
    if(!this.seleccion().size||this.confirmando())return;
    this.confirmando.set(true);
    this.servicio.confirmar([...this.seleccion().values()]).pipe(
      takeUntilDestroyed(this.destruirRef),finalize(()=>this.confirmando.set(false)),
    ).subscribe({
      next:()=>{this.seleccion.set(new Map());this.mensaje.set('Devolución confirmada.');this.consultar.next();},
      error:(e:{error?:{mensaje?:string}})=>this.mensaje.set(e.error?.mensaje || 'No pudimos confirmar la devolución.'),
    });
  }
  public reintentar():void {this.consultar.next();}
  public retorno():string {
    const q=this.ruta.snapshot.queryParamMap.get('retorno');
    return q?.startsWith('/pedidos-devueltos?')?q:'/pedidos-devueltos';
  }
  @HostListener('window:focus')
  public refrescarAlVolver():void {if(this.aplicados&&!this.confirmando())this.consultar.next();}
  private guardarGlobales():void {
    this.filtrosGlobales.actualizar({codigosAlmacen:this.filtros.codigosAlmacen});
  }
  private actualizarRuta(pagina:number):void {
    this.aplicados={...this.filtros,codigosAlmacen:[...this.filtros.codigosAlmacen],pagina,vista:this.vista()};
    this.pagina.set(pagina);this.seleccion.set(new Map());
    const queryParams={...this.filtros,pagina,vista:this.vista(),codigoAlmacen:this.filtros.codigosAlmacen,codigosAlmacen:undefined};
    const version = this.versionRuta;
    void this.enrutador.navigate([],{relativeTo:this.ruta,queryParams,replaceUrl:true}).then(()=>{
      if(version === this.versionRuta) this.consultar.next();
    });
  }
  private cargarAlmacenes():void {
    this.almacenesServicio.obtenerAlmacenes().pipe(takeUntilDestroyed(this.destruirRef)).subscribe({
      next:({datos})=>{this.almacenes.set(datos);this.errorAlmacenes.set(false);},
      error:()=>this.errorAlmacenes.set(true),
    });
  }
}
