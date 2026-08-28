const zonaHorariaHonduras = 'America/Tegucigalpa';

export function formatearFechaHoraHonduras(valor: string | null | undefined, hora12 = true): string {
  if (!valor) return 'No disponible';
  const partesLocales = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(valor);
  const fecha = partesLocales
    ? new Date(Date.UTC(Number(partesLocales[1]), Number(partesLocales[2]) - 1,
      Number(partesLocales[3]), Number(partesLocales[4]), Number(partesLocales[5]),
      Number(partesLocales[6] ?? 0)))
    : new Date(valor);
  if (Number.isNaN(fecha.getTime())) return valor;
  return new Intl.DateTimeFormat('es-HN', {
    timeZone: partesLocales ? 'UTC' : zonaHorariaHonduras,
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: hora12,
  }).format(fecha).replace(',', '');
}

export { zonaHorariaHonduras };
