import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { timer } from 'rxjs';
import { DetallePedidoVistaComponent } from '../../compartido/detalle-pedido/detalle-pedido-vista.component';
import type {
  ConfiguracionDetallePedido,
  PedidoDetalleVisual,
} from '../../compartido/detalle-pedido/detalle-pedido-vista.interface';
import type { MensajeError } from '../../compartido/error-api.interface';
import { obtenerMensajeError } from '../../compartido/manejar-error-http';
import type { DetallePedido } from './pedido.interface';
import { PedidosService } from './pedidos.service';
import { AsignacionesService } from '../../compartido/asignaciones/asignaciones.service';
import { claveArticuloAsignado, type AsignacionArticulo } from '../../compartido/asignaciones/asignacion.interface';
import { AutenticacionService } from '../autenticacion/autenticacion.service';

@Component({
  selector: 'app-detalle-pedido',
  imports: [DetallePedidoVistaComponent],
  templateUrl: './detalle-pedido.component.html',
  styleUrl: './detalle-pedido.component.css',
})
export class DetallePedidoComponent implements OnInit {
  private readonly pedidosService = inject(PedidosService);
  private readonly asignacionesService = inject(AsignacionesService);
  private readonly autenticacion = inject(AutenticacionService);
  private readonly ruta = inject(ActivatedRoute);
  private readonly enrutador = inject(Router);
  private readonly destruirRef = inject(DestroyRef);
  private folioPedido = '';
  private codigosAlmacen: string[] = [];
  private consultaEnCurso = false;
  private revisionDetalle = 0;
  private versionAsignaciones = 0;
  private refrescoPendiente = false;
  private consultaAsignacionesEnCurso = false;
  private asignacionesPendientes: DetallePedido | null = null;

  public readonly detalle = signal<DetallePedido | null>(null);
  public readonly cargando = signal(true);
  public readonly error = signal<MensajeError | null>(null);
  public readonly asignaciones = signal<ReadonlyMap<string, AsignacionArticulo>>(new Map());
  public readonly transfiriendo = signal(false);
  public readonly mensajeTransferencia = signal('');
  public readonly revisionTransferencia = signal(0);
  public readonly revisionRefresco = signal(0);
  public readonly permitirTransferencia = computed(() => {
    const rol = this.autenticacion.usuario()?.codigoRol;
    return rol === 'ADMINISTRADOR' || rol === 'OPERADOR_BODEGA';
  });
  public readonly configuracionDetalle: ConfiguracionDetallePedido = {
    contexto: 'Pedido pendiente',
    titulo: 'Detalle del pedido pendiente',
    descripcion: 'Datos del pedido y sus artículos pendientes.',
    etiquetaEstado: 'Pendiente',
    severidadEstado: 'advertencia',
    etiquetaRetorno: 'Regresar a pedidos pendientes',
    tituloInformacion: 'Información del pedido',
    etiquetaArticulos: 'Artículos del pedido',
    herramientasImpresionPendiente: true,
  };
  public readonly detalleVisual = computed<PedidoDetalleVisual | null>(() => {
    const detalle = this.detalle();
    if (!detalle) return null;
    const { cabecera, partidas } = detalle;
    const responsables = [...new Set(partidas.flatMap((partida) => {
      const identificadorDetalle = partida.numeroPartida?.trim();
      if (!identificadorDetalle) return [];
      const asignacion = this.asignaciones().get(claveArticuloAsignado({
        idOrigen: cabecera.idOrigen,
        identificadorDetalle,
      }));
      return asignacion?.nombreAsignado ? [asignacion.nombreAsignado] : [];
    }))];
    return {
      idOrigen: cabecera.idOrigen,
      numeroPedido: cabecera.numeroPedido,
      vendedor: cabecera.nombreVendedor,
      fechaPedido: cabecera.fechaHoraPedido,
      bodega: cabecera.nombresBodega,
      datosOperativos: [
        { etiqueta: 'Asignado a', valor: responsables.join(', ') || 'Sin asignar', icono: 'pi pi-user' },
        { etiqueta: 'Bodegas', valor: cabecera.nombresBodega, icono: 'pi pi-map-marker' },
      ],
      modificaciones: cabecera.modificaciones ?? [],
      articulos: partidas.map((partida, indice) => ({
        clave: partida.numeroPartida?.trim()
          ? `${cabecera.idOrigen}:${partida.numeroPartida.trim()}`
          : `${partida.codigoArticulo ?? 'articulo'}-${indice}`,
        identificadorDetalle: partida.numeroPartida,
        numeroPartida: partida.numeroPartida,
        codigo: partida.codigoArticulo,
        descripcion: partida.descripcionArticulo,
        cantidad: partida.cantidadSolicitada,
        codigoAlmacen: partida.codigoAlmacen,
        nombreAlmacen: partida.nombreAlmacen,
        estadoEntrega: partida.codigoEstadoEntrega,
        responsable: partida.numeroPartida
          ? this.asignaciones().get(claveArticuloAsignado({
            idOrigen: cabecera.idOrigen,
            identificadorDetalle: partida.numeroPartida,
          }))?.nombreAsignado ?? 'Sin asignar'
          : 'Sin asignar',
        operacionPermitida: this.puedeOperarPartida(cabecera.idOrigen, partida.numeroPartida),
      })),
    };
  });

  public ngOnInit(): void {
    this.ruta.paramMap
      .pipe(takeUntilDestroyed(this.destruirRef))
      .subscribe((parametros) => {
        const folio = parametros.get('folioPedido') ?? '';
        if (folio !== this.folioPedido) {
          ++this.revisionDetalle;
          ++this.versionAsignaciones;
          this.cargando.set(true);
          this.error.set(null);
          this.detalle.set(null);
          this.asignaciones.set(new Map());
          this.mensajeTransferencia.set('');
        }
        this.folioPedido = folio;
        this.codigosAlmacen = this.ruta.snapshot.queryParamMap.getAll('codigoAlmacen');
        this.cargarDetalle(false);
      });
    timer(5000, 5000)
      .pipe(takeUntilDestroyed(this.destruirRef))
      .subscribe(() => this.cargarDetalle(true));
  }

  public regresar(): void {
    const retorno = this.ruta.snapshot.queryParamMap.get('retorno');
    void this.enrutador.navigateByUrl(this.esRetornoSeguro(retorno) ? retorno : '/pedidos');
  }

  public reintentar(): void {
    this.cargarDetalle(false);
  }

  public actualizarAsignaciones(datos: readonly AsignacionArticulo[]): void {
    ++this.versionAsignaciones;
    const actuales = new Map(this.asignaciones());
    datos.forEach((dato) => actuales.set(claveArticuloAsignado(dato), dato));
    this.aplicarAsignaciones(actuales);
  }

  public transferirSeleccionados(lineas: readonly { idOrigen: string; identificadorDetalle: string }[]): void {
    const detalle = this.detalle();
    if (!detalle || !this.permitirTransferencia() || this.transfiriendo()) return;
    const validas = detalle.partidas.flatMap(partida => {
      const identificadorDetalle = partida.numeroPartida?.trim();
      return identificadorDetalle && this.puedeOperarPartida(detalle.cabecera.idOrigen, identificadorDetalle)
        && lineas.some(linea => linea.idOrigen === detalle.cabecera.idOrigen && linea.identificadorDetalle === identificadorDetalle)
        ? [{ idOrigen: detalle.cabecera.idOrigen, identificadorDetalle }] : [];
    });
    if (validas.length === 0) return;
    const folio = this.folioPedido;
    ++this.revisionDetalle;
    ++this.versionAsignaciones;
    this.transfiriendo.set(true);
    this.mensajeTransferencia.set('');
    this.pedidosService.despacharLineas(validas).pipe(takeUntilDestroyed(this.destruirRef)).subscribe({
      next: ({ datos }) => {
        if (folio !== this.folioPedido) { this.transfiriendo.set(false); this.cargarDetalle(true); return; }
        ++this.revisionDetalle;
        ++this.versionAsignaciones;
        const confirmadas = datos.transferidas.filter(linea => validas.some(valida =>
          valida.idOrigen === linea.idOrigen && valida.identificadorDetalle === linea.identificadorDetalle));
        if (confirmadas.length === 0) {
          this.transfiriendo.set(false);
          this.mensajeTransferencia.set('No se transfirieron artículos.');
          this.cargarDetalle(true);
          return;
        }
        this.revisionTransferencia.update(n => n + 1);
        this.mensajeTransferencia.set(`${confirmadas.length} artículo(s) transferido(s) a despachados.`);
        // La lista de despachados utiliza este mismo idOrigen para «Ver detalle».
        // Conservar las partidas visibles hasta que Angular cambie de pantalla.
        void this.enrutador.navigate(['/pedidos-despachados', confirmadas[0].idOrigen], {
          queryParams: { retorno: '/pedidos-despachados' },
        }).then(navego => {
          if (!navego) this.recuperarNavegacionTransferencia(folio);
        }).catch(() => this.recuperarNavegacionTransferencia(folio));
      },
      error: (error: { error?: { mensaje?: string } }) => {
        this.transfiriendo.set(false);
        if (folio === this.folioPedido) this.mensajeTransferencia.set(error.error?.mensaje || 'No se pudo transferir la selección.');
        this.cargarDetalle(true);
      },
    });
  }

  private recuperarNavegacionTransferencia(folio: string): void {
    if (this.destruirRef.destroyed || folio !== this.folioPedido) return;
    this.transfiriendo.set(false);
    this.mensajeTransferencia.set('Los artículos se transfirieron, pero no se pudo abrir el detalle despachado.');
    this.cargarDetalle(true);
  }

  private cargarDetalle(esAutomatica: boolean): void {
    if (!this.folioPedido) return;
    if (this.consultaEnCurso || this.transfiriendo()) { this.refrescoPendiente = true; return; }
    this.refrescoPendiente = false;
    this.consultaEnCurso = true;
    const revision = this.revisionDetalle;
    if (!esAutomatica) this.error.set(null);
    if (!this.detalle()) {
      this.cargando.set(true);
      this.error.set(null);
    }
    this.pedidosService.obtenerDetallePedido(this.folioPedido, this.codigosAlmacen)
      .pipe(takeUntilDestroyed(this.destruirRef))
      .subscribe({
        next: ({ datos }) => {
          if (revision === this.revisionDetalle) {
            if (JSON.stringify(datos) !== JSON.stringify(this.detalle())) this.detalle.set(datos);
            this.cargarAsignaciones(datos);
            this.revisionRefresco.update(n => n + 1);
            this.error.set(null);
            this.cargando.set(false);
          }
          this.terminarConsulta();
        },
        error: (error: unknown) => {
          if (revision === this.revisionDetalle && !this.detalle()) {
            this.error.set(obtenerMensajeError(error, 'detalle'));
            this.cargando.set(false);
          }
          this.terminarConsulta();
        },
      });
  }

  private terminarConsulta(): void {
    this.consultaEnCurso = false;
    if (this.refrescoPendiente) this.cargarDetalle(true);
  }

  private cargarAsignaciones(detalle: DetallePedido): void {
    if (this.consultaAsignacionesEnCurso) { this.asignacionesPendientes = detalle; return; }
    this.asignacionesPendientes = null;
    const lineas = detalle.partidas.flatMap(({ numeroPartida }) => numeroPartida?.trim()
      ? [{ idOrigen: detalle.cabecera.idOrigen, identificadorDetalle: numeroPartida.trim() }]
      : []);
    const version = ++this.versionAsignaciones;
    if (lineas.length === 0) { this.aplicarAsignaciones(new Map()); return; }
    this.consultaAsignacionesEnCurso = true;
    this.asignacionesService.consultar(lineas)
      .pipe(takeUntilDestroyed(this.destruirRef))
      .subscribe({
        next: ({ datos }) => {
          if (version === this.versionAsignaciones) this.aplicarAsignaciones(new Map(datos.map(asignacion => [claveArticuloAsignado(asignacion), asignacion])));
          this.terminarConsultaAsignaciones();
        },
        error: () => this.terminarConsultaAsignaciones(),
      });
  }

  private terminarConsultaAsignaciones(): void {
    this.consultaAsignacionesEnCurso = false;
    if (this.asignacionesPendientes) this.cargarAsignaciones(this.asignacionesPendientes);
  }

  private aplicarAsignaciones(actuales: ReadonlyMap<string, AsignacionArticulo>): void {
    const firma = (mapa: ReadonlyMap<string, AsignacionArticulo>) => JSON.stringify([...mapa].sort(([a], [b]) => a.localeCompare(b)));
    if (firma(actuales) !== firma(this.asignaciones())) this.asignaciones.set(actuales);
  }

  private puedeOperarPartida(idOrigen: string, identificadorDetalle: string | null): boolean {
    if (!identificadorDetalle) return true;
    const asignacion = this.asignaciones().get(claveArticuloAsignado({ idOrigen, identificadorDetalle }));
    const asignado = asignacion?.usuarioAsignado?.trim().toLowerCase();
    if (!asignado) return true;
    const usuario = this.autenticacion.usuario();
    const nombreUsuario = usuario?.nombreUsuario.trim().toLowerCase();
    return usuario?.codigoRol === 'ADMINISTRADOR' || nombreUsuario === 'gcruz'
      || nombreUsuario === asignado;
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
