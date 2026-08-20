const zonaHorariaHonduras = 'America/Tegucigalpa';
const fechaSinZona = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?$/;

export function formatearFechaHoraHonduras(
  valor: string | Date | null | undefined,
  incluirSegundos = false,
): string {
  if (!valor) return '—';
  const partes = typeof valor === 'string' ? fechaSinZona.exec(valor) : null;
  const fecha = partes
    ? new Date(Date.UTC(Number(partes[1]), Number(partes[2]) - 1, Number(partes[3]),
        Number(partes[4]), Number(partes[5]), Number(partes[6] ?? 0)))
    : new Date(valor);
  if (Number.isNaN(fecha.getTime())) return typeof valor === 'string' ? valor : '—';

  return new Intl.DateTimeFormat('es-HN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
    ...(incluirSegundos ? { second: '2-digit' as const } : {}),
    hour12: true,
    timeZone: partes ? 'UTC' : zonaHorariaHonduras,
  }).format(fecha).replace(',', '');
}
