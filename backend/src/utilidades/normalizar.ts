export const normalizarTexto = (valor: string): string =>
  valor.trim().replace(/\s+/g, " ");
export const normalizarNombreUsuario = (valor: string): string =>
  valor.trim().toLocaleLowerCase("es-HN");
export const normalizarCorreo = (valor: string): string =>
  valor.trim().toLocaleLowerCase("es-HN");
