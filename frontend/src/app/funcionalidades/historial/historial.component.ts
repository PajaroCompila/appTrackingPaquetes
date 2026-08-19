import { DatePipe } from '@angular/common';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DetallePedidoVistaComponent } from '../../compartido/detalle-pedido/detalle-pedido-vista.component';
import type {
  ConfiguracionDetallePedido,
  PedidoDetalleVisual,
} from '../../compartido/detalle-pedido/detalle-pedido-vista.interface';
import type { MensajeError } from '../../compartido/error-api.interface';
import { obtenerMensajeError } from '../../compartido/manejar-error-http';
import type { HistorialValidado } from './historial.interface';
import { HistorialService } from './historial.service';
import type { Almacen } from '../pedidos/almacen.interface';
import { AlmacenesService } from '../pedidos/almacenes.service';

function fechaIso(fecha: Date): string { return fecha.toISOString().slice(0, 10); }
const claveFiltrosHistorial = 'pedidosBodega.historial.filtros';

interface FiltrosHistorialGuardados {
  fechaDesde?: string;
  fechaHasta?: string;
  numeroPedido?: string;
  codigosAlmacen?: string[];
}

@Component({
  selector: 'app-historial',
  imports: [DatePipe, FormsModule, RouterLink, DetallePedidoVistaComponent],
  templateUrl: './historial.component.html',
  styleUrl: './historial.component.css',
})
export class HistorialComponent implements OnInit {
  private readonly servicio = inject(HistorialService);
  private readonly almacenesServicio = inject(AlmacenesService);
  private readonly destruirRef = inject(DestroyRef);
  private readonly ruta = inject(ActivatedRoute);
  private readonly enrutador = inject(Router);
  private readonly hoy = new Date();
  private temporizador?: ReturnType<typeof setInterval>;
  private haCargado = false;
  public readonly idOrigen = signal<string | null>(null);
  public filtros = {
    fechaDesde: fechaIso(new Date(this.hoy.getTime() - 30 * 86400000)),
    fechaHasta: fechaIso(this.hoy), numeroPedido: '', codigosAlmacen: [] as string[], cantidadPorPagina: 25,
  };
  public readonly almacenes = signal<Almacen[]>([]);
  public readonly registros = signal<HistorialValidado[]>([]);
  public readonly pagina = signal(1);
  public readonly hayMas = signal(false);
  public readonly cargando = signal(false);
  public readonly actualizando = signal(false);
  public readonly avisoActualizacion = signal('');
  public readonly error = signal<MensajeError | null>(null);
  public readonly configuracionDetalle: ConfiguracionDetallePedido = {
    contexto: 'Historial',
    titulo: 'Detalle del pedido',
    descripcion: 'Revisá los artículos y los datos de entrega.',
    etiquetaEstado: 'Entregado',
    severidadEstado: 'exito',
    etiquetaRetorno: 'Regresar al historial',
    tituloInformacion: 'Datos de entrega',
    etiquetaArticulos: 'Artículos entregados',
    soloConsulta: true,
  };
  public readonly detalleVisual = computed<PedidoDetalleVisual | null>(() => {
    if (!this.idOrigen()) return null;
    const pedido = this.registros()[0];
    if (!pedido) return null;
    return {
      numeroPedido: pedido.numeroPedido,
      vendedor: pedido.nombreVendedor,
      fechaPedido: pedido.fechaHoraPedido,
      bodega: pedido.nombresBodega,
      datosOperativos: [
        { etiqueta: 'Fecha de despacho', valor: pedido.despachadoEn, icono: 'pi pi-calendar-clock', esFecha: true },
        { etiqueta: 'Fecha de entrega', valor: pedido.validadoDetectadoEn, icono: 'pi pi-check-circle', esFecha: true },
        { etiqueta: 'Despachado por', valor: pedido.usuarioDespacho, icono: 'pi pi-user' },
        { etiqueta: 'Bodega', valor: pedido.codigosAlmacen.join(', ') || null, icono: 'pi pi-map-marker' },
      ].filter(({ valor }) => valor !== null && valor !== undefined && String(valor).trim() !== ''),
      articulos: pedido.articulos.map((articulo, indice) => ({
        clave: articulo.identificadorDetalle ?? `${articulo.codigoArticulo ?? 'articulo'}-${indice}`,
        codigo: articulo.codigoArticulo,
        descripcion: articulo.descripcion,
        cantidad: articulo.cantidad,
        codigoAlmacen: articulo.codigoAlmacen,
        nombreAlmacen: articulo.nombreAlmacen,
      })),
    };
  });

  public ngOnInit(): void {
    const idOrigen = this.ruta.snapshot.paramMap.get('idOrigen');
    this.idOrigen.set(idOrigen);
    if (idOrigen) {
      this.cargarDetalle(idOrigen);
      return;
    }
    this.hidratarFiltros();
    this.cargarAlmacenes();
    this.cargar();
    this.temporizador = setInterval(() => this.cargar(true), 5000);
    this.destruirRef.onDestroy(() => this.temporizador && clearInterval(this.temporizador));
  }

  public buscar(): void {
    this.pagina.set(1);
    this.guardarFiltros();
    this.cargar();
  }
  public estaSeleccionado(codigoAlmacen: string): boolean {
    return this.filtros.codigosAlmacen.includes(codigoAlmacen);
  }
  public alternarAlmacen(codigoAlmacen: string, seleccionado: boolean): void {
    this.filtros.codigosAlmacen = seleccionado
      ? [...new Set([...this.filtros.codigosAlmacen, codigoAlmacen])]
      : this.filtros.codigosAlmacen.filter((codigo) => codigo !== codigoAlmacen);
    this.guardarFiltros();
  }
  public limpiarAlmacenes(): void {
    this.filtros.codigosAlmacen = [];
    this.guardarFiltros();
  }
  public resumenAlmacenes(): string {
    const cantidad = this.filtros.codigosAlmacen.length;
    return cantidad === 0 ? 'Todos los almacenes'
      : cantidad === 1 ? this.filtros.codigosAlmacen[0]! : `${cantidad} almacenes seleccionados`;
  }
  public paginaAnterior(): void {
    if (this.pagina() > 1 && !this.cargando()) { this.pagina.update((valor) => valor - 1); this.cargar(); }
  }
  public paginaSiguiente(): void {
    if (this.hayMas() && !this.cargando()) { this.pagina.update((valor) => valor + 1); this.cargar(); }
  }
  public marcador(valor: string | null): string { return valor?.trim() || '—'; }
  public regresar(): void {
    const retorno = this.ruta.snapshot.queryParamMap.get('retorno');
    void this.enrutador.navigateByUrl(retorno?.startsWith('/historial-validados?')
      ? retorno : '/historial-validados');
  }
  public reintentarDetalle(): void {
    const idOrigen = this.idOrigen();
    if (idOrigen) this.cargarDetalle(idOrigen);
  }
  public rutaRetorno(): string { return `/historial-validados?${this.parametrosActuales().toString()}`; }

  private hidratarFiltros(): void {
    const parametros = this.ruta.snapshot.queryParamMap;
    const guardados = this.leerFiltrosGuardados();
    this.filtros.fechaDesde = parametros.get('fechaDesde') || guardados.fechaDesde || this.filtros.fechaDesde;
    this.filtros.fechaHasta = parametros.get('fechaHasta') || guardados.fechaHasta || this.filtros.fechaHasta;
    this.filtros.numeroPedido = parametros.get('numeroPedido') || guardados.numeroPedido || '';
    const codigosUrl = parametros.getAll('codigoAlmacen')
      .map((codigo) => codigo.trim()).filter(Boolean);
    this.filtros.codigosAlmacen = codigosUrl.length > 0
      ? [...new Set(codigosUrl)] : guardados.codigosAlmacen ?? [];
    this.guardarFiltros();
    const cantidad = Number(parametros.get('cantidadPorPagina'));
    if ([25, 50, 100].includes(cantidad)) this.filtros.cantidadPorPagina = cantidad;
    this.pagina.set(Math.max(1, Number(parametros.get('pagina')) || 1));
  }

  private parametrosActuales(): URLSearchParams {
    const parametros = new URLSearchParams({ fechaDesde: this.filtros.fechaDesde,
      fechaHasta: this.filtros.fechaHasta, pagina: String(this.pagina()),
      cantidadPorPagina: String(this.filtros.cantidadPorPagina) });
    if (this.filtros.numeroPedido.trim()) parametros.set('numeroPedido', this.filtros.numeroPedido.trim());
    for (const codigoAlmacen of this.filtros.codigosAlmacen) parametros.append('codigoAlmacen', codigoAlmacen);
    return parametros;
  }

  private cargar(esAutomatica = false): void {
    if (this.cargando() || this.actualizando()) return;
    if (this.haCargado) this.actualizando.set(true); else this.cargando.set(true);
    if (!esAutomatica) this.error.set(null);
    this.servicio.buscar({ ...this.filtros, pagina: this.pagina() })
      .pipe(takeUntilDestroyed(this.destruirRef)).subscribe({
        next: ({ datos, paginacion }) => {
          this.registros.set(datos); this.hayMas.set(paginacion.hayMas); this.haCargado = true;
          this.avisoActualizacion.set(''); this.cargando.set(false); this.actualizando.set(false);
        },
        error: (error: unknown) => {
          if (!this.haCargado) {
            this.registros.set([]); this.hayMas.set(false);
            this.error.set(obtenerMensajeError(error, 'historial'));
          } else {
            this.avisoActualizacion.set('No pudimos actualizar. Mostramos los datos anteriores.');
          }
          this.cargando.set(false); this.actualizando.set(false);
        },
      });
  }

  private cargarDetalle(idOrigen: string): void {
    this.cargando.set(true);
    this.servicio.obtener(idOrigen).pipe(takeUntilDestroyed(this.destruirRef)).subscribe({
      next: ({ datos }) => { this.registros.set([datos]); this.cargando.set(false); },
      error: (error: unknown) => { this.error.set(obtenerMensajeError(error, 'historial')); this.cargando.set(false); },
    });
  }

  private cargarAlmacenes(): void {
    this.almacenesServicio.obtenerAlmacenes()
      .pipe(takeUntilDestroyed(this.destruirRef))
      .subscribe({
        next: ({ datos }) => this.almacenes.set(datos),
        error: () => this.almacenes.set([]),
      });
  }

  private guardarFiltros(): void {
    try {
      localStorage.setItem(claveFiltrosHistorial, JSON.stringify({
        fechaDesde: this.filtros.fechaDesde,
        fechaHasta: this.filtros.fechaHasta,
        numeroPedido: this.filtros.numeroPedido.trim(),
        codigosAlmacen: this.filtros.codigosAlmacen,
      }));
    } catch { /* Los filtros continúan disponibles durante la navegación actual. */ }
  }

  private leerFiltrosGuardados(): FiltrosHistorialGuardados {
    try {
      const valor = JSON.parse(localStorage.getItem(claveFiltrosHistorial) ?? '{}') as Record<string, unknown>;
      const fechaValida = (fecha: unknown): fecha is string =>
        typeof fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fecha);
      const codigos = Array.isArray(valor['codigosAlmacen'])
        ? [...new Set(valor['codigosAlmacen'].filter((codigo): codigo is string =>
          typeof codigo === 'string' && /^[A-Za-z0-9_-]{1,16}$/.test(codigo)))] : [];
      return {
        fechaDesde: fechaValida(valor['fechaDesde']) ? valor['fechaDesde'] : undefined,
        fechaHasta: fechaValida(valor['fechaHasta']) ? valor['fechaHasta'] : undefined,
        numeroPedido: typeof valor['numeroPedido'] === 'string' && /^\d{0,20}$/.test(valor['numeroPedido'])
          ? valor['numeroPedido'] : undefined,
        codigosAlmacen: codigos,
      };
    } catch {
      return {};
    }
  }
}
