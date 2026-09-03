const prefijoFiltros = 'pedidosBodega.filtros.';
const zonaHorariaHonduras = 'America/Tegucigalpa';

export function obtenerFechaLocalActual(fecha = new Date()): string {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: zonaHorariaHonduras,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(fecha);
  const obtener = (tipo: Intl.DateTimeFormatPartTypes): string =>
    partes.find((parte) => parte.type === tipo)?.value ?? '';
  const anio = obtener('year');
  const mes = obtener('month');
  const dia = obtener('day');
  return `${anio}-${mes}-${dia}`;
}

export function esFechaCalendarioValida(valor: unknown): valor is string {
  if (typeof valor !== 'string') return false;
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor);
  if (!partes) return false;
  const anio = Number(partes[1]);
  const mes = Number(partes[2]);
  const dia = Number(partes[3]);
  if (anio < 1900 || anio > 9999) return false;
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  return fecha.getUTCFullYear() === anio
    && fecha.getUTCMonth() === mes - 1
    && fecha.getUTCDate() === dia;
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
