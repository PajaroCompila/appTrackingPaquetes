import { CommonModule } from '@angular/common';
import { Component, DestroyRef, HostListener, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink, type ParamMap } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EMPTY, Subject, catchError, exhaustMap, filter, finalize, map, merge, tap, timer } from 'rxjs';
import type { MensajeError } from '../../compartido/error-api.interface';
import { obtenerMensajeError } from '../../compartido/manejar-error-http';
import type { Almacen } from './almacen.interface';
import { AlmacenesService } from './almacenes.service';
import type { ArticuloPedidoResumen, FiltrosPedidos, InventarioArticulo, PedidoResumen } from './pedido.interface';
import { PedidosService } from './pedidos.service';
import { DialogoInventarioArticuloComponent, type EstadoConsultaInventario } from './dialogo-inventario-articulo.component';
import { VistaImpresionPedidoComponent, type ArticuloImpresionPedido } from './vista-impresion-pedido.component';

interface FormularioFiltros {
  numeroPedido: string;
  fechaDesde: string;
  fechaHasta: string;
  codigosAlmacen: string[];
  codigoSincronizacion: string;
  cantidadPorPagina: 25 | 50 | 100;
}

const formularioInicial = (fechaActual = ''): FormularioFiltros => ({
  numeroPedido: '',
  fechaDesde: fechaActual,
  fechaHasta: fechaActual,
  codigosAlmacen: [],
  codigoSincronizacion: '',
  cantidadPorPagina: 25,
});
const claveFiltrosPedidos = 'pedidosBodega.pedidos.filtros';

@Component({
  selector: 'app-lista-pedidos',
  imports: [CommonModule, FormsModule, RouterLink, DialogoInventarioArticuloComponent, VistaImpresionPedidoComponent],
  templateUrl: './lista-pedidos.component.html',
  styleUrl: './lista-pedidos.component.css',
})
export class ListaPedidosComponent implements OnInit {
  private readonly pedidosService = inject(PedidosService);
  private readonly almacenesService = inject(AlmacenesService);
  private readonly ruta = inject(ActivatedRoute);
  private readonly enrutador = inject(Router);
  private readonly destruirRef = inject(DestroyRef);
  private readonly actualizarAhora = new Subject<boolean>();
  private primeraConsulta = true;
  private consultaEnCurso = false;
  private actualizacionManualPendiente = false;
  private filtrosAplicados: FiltrosPedidos = { pagina: 1, cantidadPorPagina: 25 };

  public filtrosFormulario = formularioInicial();
  public readonly pedidos = signal<PedidoResumen[]>([]);
  public readonly almacenes = signal<Almacen[]>([]);
  public readonly pagina = signal(1);
  public readonly hayMas = signal(false);
  public readonly totalRegistros = signal(0);
  public readonly cargando = signal(true);
  public readonly actualizando = signal(false);
  public readonly avisoActualizacion = signal('');
  public readonly ultimaActualizacion = signal<Date | null>(null);
  public readonly error = signal<MensajeError | null>(null);
  public readonly errorAlmacenes = signal(false);
  public readonly informacionIncompleta = signal(false);
  public readonly transfiriendo = signal(false);
  public readonly mensajeTransferencia = signal('');
  public readonly dialogoInventarioAbierto = signal(false);
  public readonly estadoInventario = signal<EstadoConsultaInventario>('cargando');
  public readonly inventarioArticulo = signal<InventarioArticulo | null>(null);
  public readonly articulosImpresion = signal<readonly ArticuloImpresionPedido[]>([]);
  public readonly fechaHoraImpresion = signal('');
  public readonly preparandoImpresion = signal(false);
  public readonly lineasSeleccionadasImpresion = signal<ReadonlySet<string>>(new Set());
  public readonly lineasSeleccionadasTransferencia = signal<ReadonlySet<string>>(new Set());
  public readonly mensajeImpresion = signal('');
  private consultaInventarioPendiente: string | null = null;

  public ngOnInit(): void {
    this.cargarAlmacenes();
    this.iniciarActualizacionAutomatica();
    this.ruta.queryParamMap
      .pipe(takeUntilDestroyed(this.destruirRef))
      .subscribe((parametros) => {
        this.limpiarSeleccionTransferencia();
        this.limpiarSeleccionImpresion();
        this.restaurarEstadoDesdeUrl(parametros);
        this.guardarFiltros();
        this.filtrosAplicados = this.copiarFiltros(this.construirFiltros());
        const parametrosNormalizados = this.construirParametros(this.pagina());
        if (!this.sonParametrosEquivalentes(parametros, parametrosNormalizados)) {
          void this.enrutador.navigate([], {
            relativeTo: this.ruta,
            queryParams: parametrosNormalizados,
            replaceUrl: true,
          });
        }
        this.actualizarAhora.next(false);
      });
  }

  public buscar(): void {
    this.limpiarSeleccionTransferencia();
    void this.actualizarRuta(1);
  }

  public limpiarFiltros(): void {
    this.limpiarSeleccionTransferencia();
    this.filtrosFormulario = formularioInicial(this.obtenerFechaLocalActual());
    this.guardarFiltros();
    void this.actualizarRuta(1);
  }

  public cambiarCantidadPorPagina(): void {
    void this.actualizarRuta(1);
  }

  public estaSeleccionado(codigoAlmacen: string): boolean {
    return this.filtrosFormulario.codigosAlmacen.includes(codigoAlmacen);
  }

  public alternarAlmacen(codigoAlmacen: string, seleccionado: boolean): void {
    const actuales = this.filtrosFormulario.codigosAlmacen;
    this.filtrosFormulario.codigosAlmacen = seleccionado
      ? [...new Set([...actuales, codigoAlmacen])]
      : actuales.filter((codigo) => codigo !== codigoAlmacen);
    this.guardarFiltros();
  }

  public quitarAlmacen(codigoAlmacen: string): void {
    this.alternarAlmacen(codigoAlmacen, false);
  }

  public limpiarAlmacenes(): void {
    this.filtrosFormulario.codigosAlmacen = [];
    this.guardarFiltros();
  }

  public resumenAlmacenes(): string {
    const seleccionados = this.filtrosFormulario.codigosAlmacen;
    if (seleccionados.length === 0) return 'Todos los almacenes';
    if (seleccionados.length === 1) {
      return seleccionados[0] ?? '';
    }
    return `${seleccionados.length} almacenes seleccionados`;
  }

  public nombreAlmacen(codigoAlmacen: string): string {
    const almacen = this.almacenes().find((item) => item.codigoAlmacen === codigoAlmacen);
    return almacen?.nombreAlmacen || codigoAlmacen;
  }

  public codigosBodega(codigosAlmacen: string[]): string {
    return codigosAlmacen.length > 0 ? codigosAlmacen.join(', ') : '—';
  }

  public paginaAnterior(): void {
    this.limpiarSeleccionTransferencia();
    if (this.pagina() > 1 && !this.cargando()) {
      void this.actualizarRuta(this.pagina() - 1);
    }
  }

  public paginaSiguiente(): void {
    this.limpiarSeleccionTransferencia();
    if (this.hayMas() && !this.cargando()) {
      void this.actualizarRuta(this.pagina() + 1);
    }
  }

  public reintentar(): void {
    this.actualizarAhora.next(false);
  }

  public abrirInformacionArticulo(articulo: ArticuloPedidoResumen): void {
    const codigoArticulo = articulo.codigoArticulo?.trim();
    const codigoAlmacen = articulo.codigoAlmacen?.trim();
    if (!codigoArticulo || !codigoAlmacen) return;
    const clave = `${codigoArticulo}\u0000${codigoAlmacen}`;
    if (this.consultaInventarioPendiente === clave) return;

    this.dialogoInventarioAbierto.set(true);
    this.estadoInventario.set('cargando');
    this.inventarioArticulo.set(null);
    this.consultaInventarioPendiente = clave;
    this.pedidosService.obtenerInventarioArticulo(codigoArticulo, codigoAlmacen)
      .pipe(takeUntilDestroyed(this.destruirRef))
      .subscribe({
        next: (inventario) => {
          this.inventarioArticulo.set(inventario);
          this.estadoInventario.set('datos');
          this.consultaInventarioPendiente = null;
        },
        error: (error: { status?: number }) => {
          this.estadoInventario.set(error.status === 404 ? 'no-encontrado' : 'error');
          this.consultaInventarioPendiente = null;
        },
      });
  }

  public cerrarInformacionArticulo(): void {
    this.dialogoInventarioAbierto.set(false);
  }

  public claveLineaImpresion(
    pedido: PedidoResumen,
    articulo: ArticuloPedidoResumen,
    indice: number,
  ): string {
    return this.claveEstableLinea(pedido, articulo, indice);
  }

  public claveLineaTransferencia(
    pedido: PedidoResumen,
    articulo: ArticuloPedidoResumen,
    indice: number,
  ): string {
    return this.claveEstableLinea(pedido, articulo, indice);
  }

  public estaSeleccionadoParaTransferencia(
    pedido: PedidoResumen,
    articulo: ArticuloPedidoResumen,
    indice: number,
  ): boolean {
    return this.lineasSeleccionadasTransferencia()
      .has(this.claveLineaTransferencia(pedido, articulo, indice));
  }

  public alternarSeleccionTransferencia(
    pedido: PedidoResumen,
    articulo: ArticuloPedidoResumen,
    indice: number,
    seleccionado: boolean,
  ): void {
    const nuevas = new Set(this.lineasSeleccionadasTransferencia());
    const clave = this.claveLineaTransferencia(pedido, articulo, indice);
    if (seleccionado) nuevas.add(clave); else nuevas.delete(clave);
    this.lineasSeleccionadasTransferencia.set(nuevas);
    this.mensajeTransferencia.set('');
  }

  public estaSeleccionadoParaImpresion(
    pedido: PedidoResumen,
    articulo: ArticuloPedidoResumen,
    indice: number,
  ): boolean {
    return this.lineasSeleccionadasImpresion().has(this.claveLineaImpresion(pedido, articulo, indice));
  }

  public alternarSeleccionImpresion(
    pedido: PedidoResumen,
    articulo: ArticuloPedidoResumen,
    indice: number,
    seleccionado: boolean,
  ): void {
    const nuevas = new Set(this.lineasSeleccionadasImpresion());
    const clave = this.claveLineaImpresion(pedido, articulo, indice);
    if (seleccionado) nuevas.add(clave); else nuevas.delete(clave);
    this.lineasSeleccionadasImpresion.set(nuevas);
  }

  public imprimirSeleccionados(): void {
    if (this.preparandoImpresion() || this.lineasSeleccionadasImpresion().size === 0) return;
    const articulos = this.obtenerArticulosSeleccionadosVisibles();
    if (articulos.length === 0) {
      this.limpiarSeleccionImpresion();
      this.mensajeImpresion.set('Seleccioná al menos un artículo para imprimir.');
      return;
    }
    this.preparandoImpresion.set(true);
    this.mensajeImpresion.set('');
    this.fechaHoraImpresion.set(this.formatearMomentoImpresion(new Date()));
    this.articulosImpresion.set(articulos.map((articulo) => ({ ...articulo })));
    setTimeout(() => {
      window.print();
      this.preparandoImpresion.set(false);
      this.limpiarSeleccionImpresion();
    });
  }

  @HostListener('window:afterprint')
  public finalizarImpresion(): void {
    this.preparandoImpresion.set(false);
    this.limpiarSeleccionImpresion();
  }

  private obtenerArticulosSeleccionadosVisibles(): ArticuloImpresionPedido[] {
    const seleccionadas = this.lineasSeleccionadasImpresion();
    const resultado: ArticuloImpresionPedido[] = [];
    for (const pedido of this.pedidos()) {
      pedido.articulos.forEach((articulo, indice) => {
        if (!seleccionadas.has(this.claveLineaImpresion(pedido, articulo, indice))) return;
        resultado.push({
          codigo: articulo.codigoArticulo?.trim() || '—',
          descripcion: articulo.descripcion?.trim() || '—',
          cantidad: articulo.cantidad,
          bodega: articulo.codigoAlmacen?.trim() || '—',
        });
      });
    }
    return resultado;
  }

  private limpiarSeleccionImpresion(): void {
    this.lineasSeleccionadasImpresion.set(new Set());
  }

  private limpiarSeleccionTransferencia(): void {
    this.lineasSeleccionadasTransferencia.set(new Set());
  }

  private reconciliarSeleccionImpresion(pedidos: PedidoResumen[]): void {
    const visibles = new Set<string>();
    for (const pedido of pedidos) {
      pedido.articulos.forEach((articulo, indice) => {
        visibles.add(this.claveLineaImpresion(pedido, articulo, indice));
      });
    }
    this.lineasSeleccionadasImpresion.set(new Set(
      [...this.lineasSeleccionadasImpresion()].filter((clave) => visibles.has(clave)),
    ));
  }

  private reconciliarSeleccionTransferencia(pedidos: PedidoResumen[]): void {
    const visibles = new Set<string>();
    for (const pedido of pedidos) {
      pedido.articulos.forEach((articulo, indice) => {
        visibles.add(this.claveLineaTransferencia(pedido, articulo, indice));
      });
    }
    this.lineasSeleccionadasTransferencia.set(new Set(
      [...this.lineasSeleccionadasTransferencia()].filter((clave) => visibles.has(clave)),
    ));
  }

  public transferir(): void {
    if (this.lineasSeleccionadasTransferencia().size === 0 || this.transfiriendo()) return;
    const lineas = this.obtenerIdentidadesSeleccionadasTransferencia();
    if (lineas.length === 0) return;
    this.transfiriendo.set(true);
    this.mensajeTransferencia.set('');
    this.pedidosService.despacharLineas(lineas)
      .pipe(takeUntilDestroyed(this.destruirRef))
      .subscribe({
        next: ({ datos }) => {
          const transferidas = new Set(datos.transferidas.map(({ idOrigen, identificadorDetalle }) =>
            `${idOrigen}\u0000${identificadorDetalle}`));
          let pedidosRetirados = 0;
          this.pedidos.update((pedidos) => pedidos.map((pedido) => ({ ...pedido,
            articulos: pedido.articulos.filter((articulo) => {
              const identidad = articulo.identificadorDetalle?.trim();
              return !identidad || !transferidas.has(`${pedido.idOrigen}\u0000${identidad}`);
            }),
          })).filter((pedido) => {
            if (pedido.articulos.length > 0) return true;
            pedidosRetirados += 1;
            return false;
          }));
          if (pedidosRetirados > 0) {
            this.totalRegistros.update((total) => Math.max(0, total - pedidosRetirados));
          }
          this.limpiarSeleccionTransferencia();
          this.mensajeTransferencia.set(
            `${datos.transferidas.length} artículo(s) transferido(s) a despachados.`,
          );
          this.transfiriendo.set(false);
          this.actualizarAhora.next(false);
        },
        error: (error: { error?: { mensaje?: string } }) => {
          this.mensajeTransferencia.set(
            error.error?.mensaje || 'No pudimos transferir los artículos. Probá de nuevo.',
          );
          this.transfiriendo.set(false);
        },
      });
  }

  @HostListener('window:keydown', ['$event'])
  public atajoF8(evento: KeyboardEvent): void {
    const objetivo = evento.target as HTMLElement | null;
    if (evento.key !== 'F8' || evento.repeat || this.transfiriendo()
      || this.lineasSeleccionadasTransferencia().size === 0
      || objetivo?.matches('input,textarea,select,[contenteditable="true"],[role="dialog"]')) return;
    evento.preventDefault();
    if (window.confirm(`¿Transferir ${this.lineasSeleccionadasTransferencia().size} artículo(s)?`)) {
      this.transferir();
    }
  }

  public marcador(valor: string | number | null): string | number {
    return valor === null || valor === '' ? '—' : valor;
  }

  public claveArticulo(
    articulo: ArticuloPedidoResumen,
    indice: number,
  ): string {
    void indice;
    const identificador = articulo.identificadorDetalle
      ?? [articulo.codigoArticulo ?? '', articulo.codigoAlmacen ?? '',
        articulo.descripcion ?? '', String(articulo.cantidad ?? '')].join('|');
    return identificador;
  }

  public formatearFechaHora(valor: string | null): string {
    if (!valor) return '—';
    const partes = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/.exec(valor);
    if (!partes) return valor;
    const [, anio, mes, dia, hora, minuto, segundo] = partes;
    const fecha = new Date(
      Number(anio), Number(mes) - 1, Number(dia),
      Number(hora), Number(minuto), Number(segundo),
    );
    return new Intl.DateTimeFormat('es-HN', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true,
    }).format(fecha).replace(',', '');
  }

  public rutaRetorno(): string {
    const urlActual = this.enrutador.url;
    return urlActual === '/pedidos' || urlActual.startsWith('/pedidos?')
      ? urlActual
      : this.enrutador.createUrlTree(['/pedidos'], {
        queryParams: this.construirParametros(this.pagina()),
      }).toString();
  }

  private cargarAlmacenes(): void {
    this.almacenesService.obtenerAlmacenes()
      .pipe(takeUntilDestroyed(this.destruirRef))
      .subscribe({
        next: ({ datos }) => {
          this.almacenes.set(datos);
          this.errorAlmacenes.set(false);
        },
        error: () => this.errorAlmacenes.set(true),
      });
  }

  private iniciarActualizacionAutomatica(): void {
    merge(
      this.actualizarAhora,
      timer(5000, 5000).pipe(map(() => true)),
    ).pipe(
      tap((esAutomatica) => {
        if (this.consultaEnCurso && !esAutomatica) this.actualizacionManualPendiente = true;
      }),
      filter(() => !this.consultaEnCurso),
      exhaustMap((esAutomatica) => {
        this.consultaEnCurso = true;
        const mostrarCargaInicial = this.primeraConsulta;
        if (mostrarCargaInicial) this.cargando.set(true);
        else this.actualizando.set(true);
        if (!esAutomatica) this.error.set(null);
        return this.pedidosService.obtenerPedidos(this.copiarFiltros(this.filtrosAplicados)).pipe(
          map((respuesta) => ({ respuesta, esAutomatica })),
          catchError((error: unknown) => {
            if (this.primeraConsulta) {
              this.pedidos.set([]);
              this.hayMas.set(false);
              this.totalRegistros.set(0);
              this.error.set(obtenerMensajeError(error, 'listado'));
            } else {
              this.avisoActualizacion.set('No pudimos actualizar. La lista anterior sigue visible.');
            }
            this.cargando.set(false);
            this.actualizando.set(false);
            this.primeraConsulta = false;
            return EMPTY;
          }),
          finalize(() => {
            this.consultaEnCurso = false;
            if (this.actualizacionManualPendiente) {
              this.actualizacionManualPendiente = false;
              queueMicrotask(() => this.actualizarAhora.next(false));
            }
          }),
        );
      }),
      takeUntilDestroyed(this.destruirRef),
    ).subscribe(({ respuesta: { datos, paginacion, fuentes }, esAutomatica }) => {
      if (!esAutomatica && datos.length === 0 && this.pagina() > 1) {
        this.transfiriendo.set(false);
        void this.actualizarRuta(this.pagina() - 1);
        return;
      }
      this.reconciliarSeleccionImpresion(datos);
      this.reconciliarSeleccionTransferencia(datos);
      this.pedidos.set(datos);
      this.pagina.set(paginacion.pagina);
      this.hayMas.set(paginacion.hayMas);
      this.totalRegistros.set(paginacion.totalRegistros ?? datos.length);
      this.informacionIncompleta.set(
        fuentes?.sap === 'no_disponible' || fuentes?.retailOne === 'no_disponible',
      );
      this.avisoActualizacion.set('');
      this.ultimaActualizacion.set(new Date());
      this.cargando.set(false);
      this.actualizando.set(false);
      this.transfiriendo.set(false);
      this.primeraConsulta = false;
    });
  }

  private obtenerFechaLocalActual(): string {
    const fechaActual = new Date();
    const anio = fechaActual.getFullYear();
    const mes = String(fechaActual.getMonth() + 1).padStart(2, '0');
    const dia = String(fechaActual.getDate()).padStart(2, '0');
    return `${anio}-${mes}-${dia}`;
  }

  private formatearMomentoImpresion(fecha: Date): string {
    return new Intl.DateTimeFormat('es-HN', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
    }).format(fecha).replace(',', '');
  }

  private construirFiltros(): FiltrosPedidos {
    const filtros: FiltrosPedidos = {
      pagina: this.pagina(),
      cantidadPorPagina: this.filtrosFormulario.cantidadPorPagina,
    };
    const opcionales = {
      numeroPedido: this.filtrosFormulario.numeroPedido.trim(),
      fechaDesde: this.filtrosFormulario.fechaDesde,
      fechaHasta: this.filtrosFormulario.fechaHasta,
      codigoSincronizacion: this.filtrosFormulario.codigoSincronizacion.trim(),
    };
    for (const [nombre, valor] of Object.entries(opcionales)) {
      if (valor) Object.assign(filtros, { [nombre]: valor });
    }
    if (this.filtrosFormulario.codigosAlmacen.length > 0) {
      filtros.codigosAlmacen = [...this.filtrosFormulario.codigosAlmacen];
    }
    return filtros;
  }

  private copiarFiltros(filtros: FiltrosPedidos): FiltrosPedidos {
    return { ...filtros,
      codigosAlmacen: filtros.codigosAlmacen ? [...filtros.codigosAlmacen] : undefined };
  }

  private construirParametros(pagina: number): Record<string, string | number | string[]> {
    const filtros = this.construirFiltros();
    const parametros: Record<string, string | number | string[]> = {
      pagina,
      cantidadPorPagina: filtros.cantidadPorPagina,
    };
    for (const [nombre, valor] of Object.entries(filtros)) {
      if (nombre !== 'pagina' && nombre !== 'cantidadPorPagina' && valor) {
        parametros[nombre === 'codigosAlmacen' ? 'codigoAlmacen' : nombre] = valor;
      }
    }
    return parametros;
  }

  private restaurarEstadoDesdeUrl(parametros: ParamMap): void {
    const fechaActual = this.obtenerFechaLocalActual();
    const guardados = this.leerFiltrosGuardados();
    const cantidadSolicitada = Number(parametros.get('cantidadPorPagina') ?? guardados.cantidadPorPagina);
    const paginaSolicitada = Number(parametros.get('pagina') ?? guardados.pagina);
    const codigosUrl = parametros.getAll('codigoAlmacen').map((codigo) => codigo.trim()).filter(Boolean);
    this.filtrosFormulario = {
      numeroPedido: parametros.get('numeroPedido') ?? parametros.get('folioPedido')
        ?? guardados.numeroPedido ?? '',
      fechaDesde: parametros.get('fechaDesde') ?? guardados.fechaDesde ?? fechaActual,
      fechaHasta: parametros.get('fechaHasta') ?? guardados.fechaHasta ?? fechaActual,
      codigosAlmacen: codigosUrl.length > 0 ? [...new Set(codigosUrl)] : guardados.codigosAlmacen ?? [],
      codigoSincronizacion: parametros.get('codigoSincronizacion') ?? guardados.codigoSincronizacion ?? '',
      cantidadPorPagina: cantidadSolicitada === 50 || cantidadSolicitada === 100
        ? cantidadSolicitada
        : 25,
    };
    this.pagina.set(
      Number.isInteger(paginaSolicitada) && paginaSolicitada > 0 ? paginaSolicitada : 1,
    );
  }

  private guardarFiltros(): void {
    try {
      localStorage.setItem(claveFiltrosPedidos, JSON.stringify({
        ...this.filtrosFormulario, pagina: this.pagina(),
      }));
    } catch { /* La pantalla conserva los filtros mientras permanece abierta. */ }
  }

  private leerFiltrosGuardados(): Partial<FormularioFiltros> & { pagina?: number } {
    try {
      const valor = JSON.parse(localStorage.getItem(claveFiltrosPedidos) ?? '{}');
      return valor && typeof valor === 'object' ? valor as Partial<FormularioFiltros> & { pagina?: number } : {};
    } catch { return {}; }
  }

  private sonParametrosEquivalentes(
    actuales: ParamMap,
    esperados: Record<string, string | number | string[]>,
  ): boolean {
    const clavesEsperadas = Object.keys(esperados).sort();
    if (actuales.keys.slice().sort().join('|') !== clavesEsperadas.join('|')) return false;
    return clavesEsperadas.every((clave) => {
      const valorEsperado = esperados[clave];
      const valoresEsperados = (Array.isArray(valorEsperado) ? valorEsperado : [valorEsperado])
        .map(String);
      const valoresActuales = actuales.getAll(clave);
      return valoresActuales.length === valoresEsperados.length
        && valoresActuales.every((valor, indice) => valor === valoresEsperados[indice]);
    });
  }

  private async actualizarRuta(pagina: number): Promise<void> {
    this.limpiarSeleccionImpresion();
    this.limpiarSeleccionTransferencia();
    const navego = await this.enrutador.navigate([], {
      relativeTo: this.ruta,
      queryParams: this.construirParametros(pagina),
    });
    if (!navego) {
      this.pagina.set(pagina);
      this.actualizarAhora.next(false);
    }
  }

  private claveEstableLinea(
    pedido: PedidoResumen,
    articulo: ArticuloPedidoResumen,
    indice: number,
  ): string {
    void indice;
    const detalle = articulo.identificadorDetalle?.trim();
    return `${pedido.idOrigen}\u0000${detalle ?? ''}`;
  }

  private obtenerIdentidadesSeleccionadasTransferencia(): {
    idOrigen: string;
    identificadorDetalle: string;
  }[] {
    const seleccionadas = this.lineasSeleccionadasTransferencia();
    const resultado: { idOrigen: string; identificadorDetalle: string }[] = [];
    for (const pedido of this.pedidos()) {
      pedido.articulos.forEach((articulo, indice) => {
        const identificadorDetalle = articulo.identificadorDetalle?.trim();
        if (identificadorDetalle
          && seleccionadas.has(this.claveLineaTransferencia(pedido, articulo, indice))) {
          resultado.push({ idOrigen: pedido.idOrigen, identificadorDetalle });
        }
      });
    }
    return resultado;
  }
}
