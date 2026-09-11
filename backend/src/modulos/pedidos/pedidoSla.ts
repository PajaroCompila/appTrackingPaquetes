import type { PedidoResumen } from './pedido.interface.js';

const nombresVendedoresEspeciales = new Set([
  'ELIASAR',
  'ELISAAR',
  'JENSY',
  'NAHUM',
  'NAUN',
]);

function palabrasNormalizadas(valor: string | null | undefined): string[] {
  return (valor ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(Boolean);
}

export function esVendedorEspecialSinSla(nombreVendedor: string | null | undefined): boolean {
  return palabrasNormalizadas(nombreVendedor)
    .some((palabra) => nombresVendedoresEspeciales.has(palabra));
}

export function aplicarExclusionSlaPorVendedor(pedidos: PedidoResumen[]): void {
  pedidos.forEach((pedido) => {
    if (esVendedorEspecialSinSla(pedido.nombreVendedor)) {
      pedido.excluidoSla = true;
    }
  });
}
