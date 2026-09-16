import type { PedidoResumen } from './pedido.interface.js';

export const NOMBRES_VENDEDORES_ESPECIALES = [
  'ELIASAR',
  'ELISAAR',
  'JENSY',
  'NAHUM',
  'NAUN',
] as const;
const nombresVendedoresEspeciales = new Set<string>(NOMBRES_VENDEDORES_ESPECIALES);

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
