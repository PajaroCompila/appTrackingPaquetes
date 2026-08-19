import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { DetallePedidoVistaComponent } from '../../compartido/detalle-pedido/detalle-pedido-vista.component';
import type {
  ConfiguracionDetallePedido,
  PedidoDetalleVisual,
} from '../../compartido/detalle-pedido/detalle-pedido-vista.interface';
import type { MensajeError } from '../../compartido/error-api.interface';
import { obtenerMensajeError } from '../../compartido/manejar-error-http';
import type { DetallePedido } from './pedido.interface';
import { PedidosService } from './pedidos.service';

@Component({
  selector: 'app-detalle-pedido',
  imports: [DetallePedidoVistaComponent],
  templateUrl: './detalle-pedido.component.html',
  styleUrl: './detalle-pedido.component.css',
})
export class DetallePedidoComponent implements OnInit {
  private readonly pedidosService = inject(PedidosService);
  private readonly ruta = inject(ActivatedRoute);
  private readonly enrutador = inject(Router);
  private readonly destruirRef = inject(DestroyRef);
  private folioPedido = '';
  private codigosAlmacen: string[] = [];

  public readonly detalle = signal<DetallePedido | null>(null);
  public readonly cargando = signal(true);
  public readonly error = signal<MensajeError | null>(null);
  public readonly configuracionDetalle: ConfiguracionDetallePedido = {
    contexto: 'Pedido pendiente',
    titulo: 'Detalle del pedido pendiente',
    descripcion: 'Datos del pedido y sus artículos pendientes.',
    etiquetaEstado: 'Pendiente',
    severidadEstado: 'advertencia',
    etiquetaRetorno: 'Regresar a pedidos pendientes',
    tituloInformacion: 'Información del pedido',
    etiquetaArticulos: 'Artículos del pedido',
    soloConsulta: true,
  };
  public readonly detalleVisual = computed<PedidoDetalleVisual | null>(() => {
    const detalle = this.detalle();
    if (!detalle) return null;
    const { cabecera, partidas } = detalle;
    return {
      numeroPedido: cabecera.numeroPedido,
      vendedor: cabecera.nombreVendedor,
      fechaPedido: cabecera.fechaHoraPedido,
      bodega: cabecera.nombresBodega,
      datosOperativos: [
        { etiqueta: 'Bodegas', valor: cabecera.nombresBodega, icono: 'pi pi-map-marker' },
        { etiqueta: 'Código de estado', valor: cabecera.codigoEstadoVenta, icono: 'pi pi-info-circle' },
        { etiqueta: 'Estado de sincronización', valor: cabecera.codigoSincronizacion, icono: 'pi pi-sync' },
      ],
      articulos: partidas.map((partida, indice) => ({
        clave: partida.numeroPartida ?? `${partida.codigoArticulo ?? 'articulo'}-${indice}`,
        numeroPartida: partida.numeroPartida,
        codigo: partida.codigoArticulo,
        descripcion: partida.descripcionArticulo,
        cantidad: partida.cantidadSolicitada,
        codigoAlmacen: partida.codigoAlmacen,
        nombreAlmacen: partida.nombreAlmacen,
        estadoEntrega: partida.codigoEstadoEntrega,
      })),
    };
  });

  public ngOnInit(): void {
    this.ruta.paramMap
      .pipe(takeUntilDestroyed(this.destruirRef))
      .subscribe((parametros) => {
        this.folioPedido = parametros.get('folioPedido') ?? '';
        this.codigosAlmacen = this.ruta.snapshot.queryParamMap.getAll('codigoAlmacen');
        this.cargarDetalle();
      });
  }

  public regresar(): void {
    const retorno = this.ruta.snapshot.queryParamMap.get('retorno');
    void this.enrutador.navigateByUrl(this.esRetornoSeguro(retorno) ? retorno : '/pedidos');
  }

  public reintentar(): void {
    this.cargarDetalle();
  }

  private cargarDetalle(): void {
    this.cargando.set(true);
    this.error.set(null);
    this.detalle.set(null);
    this.pedidosService.obtenerDetallePedido(this.folioPedido, this.codigosAlmacen)
      .pipe(takeUntilDestroyed(this.destruirRef))
      .subscribe({
        next: ({ datos }) => {
          this.detalle.set(datos);
          this.cargando.set(false);
        },
        error: (error: unknown) => {
          this.error.set(obtenerMensajeError(error, 'detalle'));
          this.cargando.set(false);
        },
      });
  }

  private esRetornoSeguro(retorno: string | null): retorno is string {
    if (!retorno) return false;
    try {
      const arbol = this.enrutador.parseUrl(retorno);
      const segmentos = arbol.root.children['primary']?.segments.map(({ path }) => path) ?? [];
      return segmentos.length === 1 && segmentos[0] === 'pedidos';
    } catch {
      return false;
    }
  }
}
