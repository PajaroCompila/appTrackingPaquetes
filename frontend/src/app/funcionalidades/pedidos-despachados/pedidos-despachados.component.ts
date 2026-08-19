import { HttpClient, HttpParams } from '@angular/common/http';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { environment } from '../../../environments/environment';
import { DetallePedidoVistaComponent } from '../../compartido/detalle-pedido/detalle-pedido-vista.component';
import type {
  ConfiguracionDetallePedido,
  ErrorDetalleVisual,
  PedidoDetalleVisual,
} from '../../compartido/detalle-pedido/detalle-pedido-vista.interface';
import type { PedidoResumen } from '../pedidos/pedido.interface';

interface Despachado extends PedidoResumen {
  estadoLocal: 'DESPACHADO';
  despachadoEn: string;
  usuarioDespacho: string;
  esParcial?: boolean | null;
}

@Component({
  selector: 'app-pedidos-despachados',
  imports: [RouterLink, DetallePedidoVistaComponent],
  templateUrl: './pedidos-despachados.component.html',
  styleUrl: '../pedidos/lista-pedidos.component.css',
})
export class PedidosDespachadosComponent implements OnInit {
  private readonly clienteHttp = inject(HttpClient);
  private readonly ruta = inject(ActivatedRoute);
  private readonly enrutador = inject(Router);
  private readonly destruirRef = inject(DestroyRef);
  private pagina = 1;
  private cantidadPorPagina = 100;
  private temporizador?: ReturnType<typeof setInterval>;
  public readonly pedidos = signal<Despachado[]>([]);
  public readonly idOrigen = signal<string | null>(null);
  public readonly cargando = signal(true);
  public readonly error = signal(false);
  public readonly configuracionDetalle = computed<ConfiguracionDetallePedido>(() => {
    const pedido = this.pedidos()[0];
    return {
      contexto: 'Registro local',
      titulo: 'Detalle del pedido despachado',
      descripcion: 'Datos del pedido despachado.',
      etiquetaEstado: pedido?.esParcial === true ? 'Despacho parcial' : 'Despachado',
      severidadEstado: pedido?.esParcial === true ? 'advertencia' : 'exito',
      etiquetaRetorno: 'Regresar a pedidos despachados',
      tituloInformacion: 'Información de entrega',
      etiquetaArticulos: 'Artículos despachados del pedido',
      soloConsulta: true,
      aviso: pedido?.esParcial === true
        ? 'Despacho parcial: este pedido todavía conserva líneas pendientes.'
        : null,
    };
  });
  public readonly errorDetalle = computed<ErrorDetalleVisual | null>(() =>
    this.error() && this.idOrigen()
      ? { titulo: 'No pudimos cargar el pedido', detalle: 'Probá de nuevo.' }
      : null);
  public readonly detalleVisual = computed<PedidoDetalleVisual | null>(() => {
    if (!this.idOrigen()) return null;
    const pedido = this.pedidos()[0];
    if (!pedido) return null;
    return {
      numeroPedido: pedido.numeroPedido,
      vendedor: pedido.nombreVendedor,
      fechaPedido: pedido.fechaHoraPedido,
      bodega: pedido.nombresBodega,
      datosOperativos: [
        { etiqueta: 'Fecha de despacho', valor: pedido.despachadoEn, icono: 'pi pi-calendar-clock', esFecha: true },
        { etiqueta: 'Usuario que despachó', valor: pedido.usuarioDespacho, icono: 'pi pi-user' },
        { etiqueta: 'Bodegas', valor: pedido.codigosAlmacen?.join(', ') || null, icono: 'pi pi-map-marker' },
        { etiqueta: 'Tipo de despacho', valor: pedido.esParcial === true ? 'Parcial' : 'Completo', icono: 'pi pi-check-circle' },
      ],
      articulos: pedido.articulos.map((articulo, indice) => ({
        clave: articulo.identificadorDetalle ?? `${articulo.codigoArticulo ?? 'articulo'}-${indice}`,
        codigo: articulo.codigoArticulo,
        descripcion: articulo.descripcion,
        cantidad: articulo.cantidad,
        codigoAlmacen: articulo.codigoAlmacen,
        nombreAlmacen: articulo.nombreAlmacen,
        fechaDespacho: articulo.transferidoEn ?? pedido.despachadoEn,
        usuario: articulo.usuarioTransferencia ?? pedido.usuarioDespacho,
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

    this.pagina = Math.max(1, Number(this.ruta.snapshot.queryParamMap.get('pagina')) || 1);
    const cantidadSolicitada = Number(this.ruta.snapshot.queryParamMap.get('cantidadPorPagina'));
    this.cantidadPorPagina = [25, 50, 100].includes(cantidadSolicitada) ? cantidadSolicitada : 100;
    this.cargarListado();
    this.temporizador = setInterval(() => this.cargarListado(), 5000);
    this.destruirRef.onDestroy(() => this.temporizador && clearInterval(this.temporizador));
  }

  private cargarListado(): void {
    this.clienteHttp.get<{ datos: Despachado[] }>(
      `${environment.urlApi}/pedidos-despachados`,
      { params: new HttpParams().set('pagina', this.pagina)
        .set('cantidadPorPagina', this.cantidadPorPagina) },
    ).subscribe({ next: ({ datos }) => this.finalizarCarga(datos), error: () => this.marcarError() });
  }

  public regresar(): void {
    const retorno = this.ruta.snapshot.queryParamMap.get('retorno');
    void this.enrutador.navigateByUrl(
      retorno === '/pedidos-despachados' || retorno?.startsWith('/pedidos-despachados?')
        ? retorno
        : '/pedidos-despachados',
    );
  }

  public rutaRetorno(): string {
    return this.enrutador.url === '/pedidos-despachados'
      || this.enrutador.url.startsWith('/pedidos-despachados?')
      ? this.enrutador.url
      : '/pedidos-despachados';
  }

  public fecha(valor: string | null | undefined): string {
    return valor ? new Date(valor).toLocaleString('es-HN') : '—';
  }

  public reintentarDetalle(): void {
    const idOrigen = this.idOrigen();
    if (!idOrigen) return;
    this.error.set(false);
    this.cargando.set(true);
    this.cargarDetalle(idOrigen);
  }

  private cargarDetalle(idOrigen: string): void {
    this.clienteHttp.get<{ datos: Despachado }>(
      `${environment.urlApi}/pedidos-despachados/${encodeURIComponent(idOrigen)}`,
    ).subscribe({ next: ({ datos }) => this.finalizarCarga([datos]), error: () => this.marcarError() });
  }

  private finalizarCarga(pedidos: Despachado[]): void {
    this.pedidos.set(pedidos);
    this.cargando.set(false);
  }

  private marcarError(): void {
    this.error.set(true);
    this.cargando.set(false);
  }
}
