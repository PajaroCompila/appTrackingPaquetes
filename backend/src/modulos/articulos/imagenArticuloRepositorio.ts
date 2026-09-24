import { readFile, stat } from 'node:fs/promises';
import { win32 as rutasWindows } from 'node:path';
import sql from 'mssql';
import { consultarSap } from '../../infraestructura/sql/consultaSap.js';

interface FilaImagenArticulo {
  nombreArchivo: string | null;
  rutaBase: string | null;
}

export interface ImagenArticulo {
  contenido: Buffer;
  tipoContenido: string;
  modificadaEn: Date;
}

export type ConsultarImagenArticuloSap = typeof consultarSap;
export type LeerImagenArticulo = typeof readFile;
export type ConsultarArchivoImagen = typeof stat;

const tiposImagen = new Map<string, string>([
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.gif', 'image/gif'],
  ['.bmp', 'image/bmp'],
  ['.webp', 'image/webp'],
]);
const tamanoMaximoImagen = 20 * 1024 * 1024;

export class ImagenArticuloRepositorio {
  public constructor(
    private readonly consultar: ConsultarImagenArticuloSap = consultarSap,
    private readonly leerArchivo: LeerImagenArticulo = readFile,
    private readonly consultarArchivo: ConsultarArchivoImagen = stat,
  ) {}

  public async obtener(codigoArticulo: string): Promise<ImagenArticulo | null> {
    const resultado = await this.consultar<FilaImagenArticulo>(`
      SELECT TOP (1)
        articulo.[PicturName] AS nombreArchivo,
        CONVERT(nvarchar(1000), configuracion.[BitmapPath]) AS rutaBase
      FROM [dbo].[OITM] articulo
      CROSS JOIN [dbo].[OADP] configuracion
      WHERE articulo.[ItemCode] = @codigoArticulo;
    `, (solicitud) => solicitud.input('codigoArticulo', sql.NVarChar(100), codigoArticulo));

    const referencia = resultado.recordset[0];
    const nombreArchivo = referencia?.nombreArchivo?.trim();
    const rutaBase = referencia?.rutaBase?.trim();
    if (!nombreArchivo || !rutaBase || rutasWindows.basename(nombreArchivo) !== nombreArchivo) return null;

    const extension = rutasWindows.extname(nombreArchivo).toLowerCase();
    const tipoContenido = tiposImagen.get(extension);
    if (!tipoContenido) return null;

    const baseResuelta = rutasWindows.resolve(rutaBase);
    const rutaImagen = rutasWindows.resolve(baseResuelta, nombreArchivo);
    const relativa = rutasWindows.relative(baseResuelta, rutaImagen);
    if (!relativa || relativa.startsWith('..') || rutasWindows.isAbsolute(relativa)) return null;

    try {
      const informacion = await this.consultarArchivo(rutaImagen);
      if (!informacion.isFile() || informacion.size <= 0 || informacion.size > tamanoMaximoImagen) return null;
      return {
        contenido: await this.leerArchivo(rutaImagen),
        tipoContenido,
        modificadaEn: informacion.mtime,
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }
}
