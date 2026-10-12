let versionProyeccionR1 = 0;

export function obtenerVersionProyeccionHistorialR1(): number {
  return versionProyeccionR1;
}

export function marcarCambioProyeccionHistorialR1(): void {
  versionProyeccionR1 += 1;
}
