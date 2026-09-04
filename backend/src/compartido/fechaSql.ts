const fechaHoraSinZona = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?$/;

export function fechaSqlSinZona(fecha: Date | null | undefined): string | null {
  if (!fecha) return null;
  const numero = (valor: number): string => String(valor).padStart(2, '0');
  return `${fecha.getUTCFullYear()}-${numero(fecha.getUTCMonth() + 1)}-${numero(fecha.getUTCDate())}`
    + `T${numero(fecha.getUTCHours())}:${numero(fecha.getUTCMinutes())}:${numero(fecha.getUTCSeconds())}`;
}

export function fechaTextoSinZonaParaSql(fecha: string | null | undefined): Date | null {
  if (!fecha) return null;
  if (!fechaHoraSinZona.test(fecha)) {
    throw new RangeError('La fecha y hora recibida no tiene el formato esperado.');
  }
  return new Date(`${fecha}Z`);
}
