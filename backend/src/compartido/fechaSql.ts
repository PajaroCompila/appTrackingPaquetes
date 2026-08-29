export function fechaSqlSinZona(fecha: Date | null | undefined): string | null {
  if (!fecha) return null;
  const numero = (valor: number): string => String(valor).padStart(2, '0');
  return `${fecha.getUTCFullYear()}-${numero(fecha.getUTCMonth() + 1)}-${numero(fecha.getUTCDate())}`
    + `T${numero(fecha.getUTCHours())}:${numero(fecha.getUTCMinutes())}:${numero(fecha.getUTCSeconds())}`;
}
