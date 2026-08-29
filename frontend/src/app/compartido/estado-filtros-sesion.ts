const prefijoFiltros = 'pedidosBodega.filtros.';

export function obtenerFechaLocalActual(fecha = new Date()): string {
  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

export function guardarFiltrosSesion(clave: string, filtros: unknown): void {
  try { sessionStorage.setItem(`${prefijoFiltros}${clave}`, JSON.stringify(filtros)); } catch { /* Sin persistencia. */ }
}

export function leerFiltrosSesion(clave: string): Record<string, unknown> {
  try {
    const valor = JSON.parse(sessionStorage.getItem(`${prefijoFiltros}${clave}`) ?? '{}');
    return valor && typeof valor === 'object' ? valor as Record<string, unknown> : {};
  } catch { return {}; }
}

export function limpiarFiltrosSesion(): void {
  try {
    for (let indice = sessionStorage.length - 1; indice >= 0; indice -= 1) {
      const clave = sessionStorage.key(indice);
      if (clave?.startsWith(prefijoFiltros)) sessionStorage.removeItem(clave);
    }
  } catch { /* No hay almacenamiento disponible. */ }
}
