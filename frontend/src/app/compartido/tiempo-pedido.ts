export interface FechasTiempoPedido {
  fechaEntradaCola?: string | null;
  fechaEntradaOrigen?: string | null;
  fechaHoraPedido?: string | null;
}

export function fechaPedidoComoInstante(valor: string | null | undefined): number | null {
  if (!valor) return null;
  const normalizada = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?$/.test(valor)
    ? `${valor}-06:00` : valor;
  const instante = Date.parse(normalizada);
  return Number.isFinite(instante) ? instante : null;
}

export function inicioTiempoPedido(pedido: FechasTiempoPedido): number | null {
  return fechaPedidoComoInstante(
    pedido.fechaEntradaCola ?? pedido.fechaEntradaOrigen ?? pedido.fechaHoraPedido,
  );
}

export function duracionPedidoMs(
  pedido: FechasTiempoPedido,
  fin: string | number | null | undefined,
): number | null {
  const inicio = inicioTiempoPedido(pedido);
  const terminado = typeof fin === 'number' ? fin : fechaPedidoComoInstante(fin);
  return inicio === null || terminado === null || terminado < inicio ? null : terminado - inicio;
}

export function formatearDuracionPedido(duracionMs: number | null): string {
  if (duracionMs === null) return 'No disponible';
  const segundosTotales = Math.floor(duracionMs / 1000);
  const horas = Math.floor(segundosTotales / 3600);
  const minutos = Math.floor((segundosTotales % 3600) / 60);
  const segundos = segundosTotales % 60;
  const dos = (valor: number): string => String(valor).padStart(2, '0');
  const minutosSegundos = `${dos(minutos)}:${dos(segundos)}`;
  return horas > 0 ? `${dos(horas)}:${minutosSegundos}` : minutosSegundos;
}
