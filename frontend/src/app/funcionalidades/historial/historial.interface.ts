import type { PedidoResumen } from '../pedidos/pedido.interface';

export interface HistorialValidado extends PedidoResumen {
  estadoLocal: 'VALIDADO' | 'DESPACHADO';
  despachadoEn: string | null;
  validadoDetectadoEn: string | null;
  usuarioDespacho: string | null;
}

export interface RespuestaHistorial {
  datos: HistorialValidado[];
  paginacion: {
    pagina: number;
    cantidadPorPagina: number;
    cantidadDevuelta: number;
    hayMas: boolean;
  };
}
