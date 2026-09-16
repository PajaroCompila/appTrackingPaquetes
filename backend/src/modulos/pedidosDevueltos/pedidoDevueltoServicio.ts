export type EstadoDevolucion = 'PENDIENTE DE DEVOLUCIÓN' | 'DEVOLUCIÓN PARCIAL' | 'DEVUELTO';

export interface LineaPedidoDevueltoBase {
  identificadorDetalle: string;
  codigoArticulo: string | null;
  descripcion: string | null;
  cantidad: number;
  codigoAlmacen: string | null;
}

export interface PedidoDevueltoEntrada {
  idOrigen: string;
  origenPedido?: 'R1' | 'SAP';
  folioPedido?: string | null;
  fechaDespacho?: string | null;
  canceladoPor?: string | null;
  numeroPedido: string;
  nombreVendedor?: string | null;
  fechaHoraPedido?: string | null;
  fechaCancelacion?: string | null;
  motivo?: string | null;
  lineas: LineaPedidoDevueltoBase[];
  fueDespachado: boolean;
}

export interface LineaPedidoDevuelto extends LineaPedidoDevueltoBase {
  estado: EstadoDevolucion;
  cantidadRecibida?: number;
  recibidoPor?: string | null;
  recibidoEn?: string | null;
}

export interface PedidoDevuelto extends PedidoDevueltoEntrada {
  idClave: string;
  estado: EstadoDevolucion;
  lineas: LineaPedidoDevuelto[];
  progreso: number;
  totalLineas?: number;
  lineasRecibidas?: number;
  fechaDevolucionCompleta?: string | null;
}

export function crearDevolucionDesdeDespacho(pedido: PedidoDevueltoEntrada): PedidoDevuelto | null {
  if (!pedido.fueDespachado || pedido.lineas.length === 0) {
    return null;
  }

  const lineas: LineaPedidoDevuelto[] = pedido.lineas.map((linea) => ({
    ...linea,
    estado: 'PENDIENTE DE DEVOLUCIÓN',
    recibidoPor: null,
    recibidoEn: null,
  }));

  return {
    ...pedido,
    idClave: pedido.idOrigen,
    estado: 'PENDIENTE DE DEVOLUCIÓN',
    lineas,
    progreso: 0,
    totalLineas: lineas.length,
    lineasRecibidas: 0,
    fechaDevolucionCompleta: null,
  };
}

export function calcularEstadoDevolucion(lineasRecibidas: number, totalLineas: number): EstadoDevolucion {
  if (totalLineas <= 0) return 'PENDIENTE DE DEVOLUCIÓN';
  if (lineasRecibidas >= totalLineas) return 'DEVUELTO';
  if (lineasRecibidas > 0) return 'DEVOLUCIÓN PARCIAL';
  return 'PENDIENTE DE DEVOLUCIÓN';
}

export function puedeConfirmarLinea(
  usuario: { codigoRol: string | null; codigosAlmacenVisibles?: string[] } | undefined,
  codigoAlmacenLinea: string | null,
  codigoAlmacenSolicitado: string | null,
): boolean {
  if (!usuario || !codigoAlmacenLinea || !codigoAlmacenSolicitado) return false;
  const rol = usuario.codigoRol?.toUpperCase();
  if (rol === 'ADMINISTRADOR') return true;
  if (rol === 'CONSULTA') return false;
  if (rol === 'OPERADOR_BODEGA') {
    const permitidos = (usuario.codigosAlmacenVisibles ?? []).map((codigo) => codigo.toUpperCase());
    if (permitidos.length === 0) return codigoAlmacenLinea.toUpperCase() === codigoAlmacenSolicitado.toUpperCase();
    return permitidos.includes(codigoAlmacenSolicitado.toUpperCase())
      && codigoAlmacenLinea.toUpperCase() === codigoAlmacenSolicitado.toUpperCase();
  }
  return false;
}
