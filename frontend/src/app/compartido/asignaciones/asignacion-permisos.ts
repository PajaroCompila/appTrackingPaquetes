export function esUsuarioBod(nombreUsuario: string | null | undefined): boolean {
  return nombreUsuario?.trim().toLocaleLowerCase('es').includes('bod') ?? false;
}
